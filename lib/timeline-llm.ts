import OpenAI from "openai";
import { z } from "zod";
import type { TapsaTimeline, TimelineEra, TimelineEvent } from "./timeline-types";
import { EVENT_CATEGORIES, TIMELINE_SCHEMA_VERSION } from "./timeline-types";
import { titleToSlug } from "./slug";

const MIN_EVENTS = 8;
const MAX_EVENTS = 30;
/** Groq 8b instant allows ~6k tokens/request — keep input small. */
const ARTICLE_CHAR_LIMITS = [4000, 2500, 1500] as const;
const MAX_OUTPUT_TOKENS = 2048;

/** Timeline extraction models — 8b default for Groq free-tier headroom. */
const TIMELINE_MODELS = [
  process.env.TAPSA_TIMELINE_MODEL,
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
].filter((m, i, a): m is string => Boolean(m) && a.indexOf(m) === i);

function llmConfig() {
  return {
    baseURL: process.env.TAPSA_LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
    models: TIMELINE_MODELS.length > 0 ? TIMELINE_MODELS : ["llama-3.1-8b-instant"],
    apiKey: process.env.GROQ_API_KEY ?? process.env.TAPSA_LLM_API_KEY ?? "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = (err as { status?: number })?.status;
  return status === 429 || msg.includes("429") || msg.includes("rate limit");
}

function isPayloadTooLarge(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = (err as { status?: number })?.status;
  return status === 413 || msg.includes("413") || msg.includes("too large") || msg.includes("request too large");
}

function parseRetryAfterMs(message: string): number | null {
  const m = message.match(/try again in (?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = m[2] ? Number(m[2]) : 0;
  if (!minutes && !seconds) return null;
  return Math.ceil((minutes * 60 + seconds) * 1000);
}

function trimArticleForLlm(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.72);
  const tail = maxChars - head - 48;
  return `${text.slice(0, head)}\n\n[…middle omitted…]\n\n${text.slice(-tail)}`;
}

async function chatWithRetry(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages,
      });
      return resp.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
      if ((!isRateLimitError(err) && !isPayloadTooLarge(err)) || attempt === 3) break;
      const wait =
        parseRetryAfterMs(err instanceof Error ? err.message : String(err)) ??
        Math.min(1500 * 2 ** attempt, 12_000);
      await sleep(wait);
    }
  }
  throw lastErr;
}

export class TimelineExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineExtractionError";
  }
}

const EXTRACTION_SYSTEM = `Extract real dated historical events from Wikipedia article text. Output raw JSON only.

Rules:
- Events are things that HAPPENED (founding, invention, publication, battle, death, launch). Never section headings or "Chapter N".
- Every event needs a date grounded in the text; drop undated items. Never guess years or reuse section numbers.
- 8–30 events, spread across time. title ≤8 words, names the event.
- 3–5 eras partitioning the range; topic-appropriate era names.
- year_sort: signed integer (BC negative). year_display: human string.
- wiki_title: Wikipedia title with underscores.
- category: SCIENCE|MATHEMATICS|PHYSICS|ASTRONOMY|OBSERVATION|PHILOSOPHY|CULTURE|TECHNOLOGY.`;

const rawOutputSchema = z.object({
  topic: z.string().min(1),
  eras: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        start: z.number(),
        end: z.number(),
      }),
    )
    .min(3)
    .max(5),
  events: z.array(
    z.object({
      year_display: z.string().min(1),
      year_sort: z.number(),
      title: z.string().min(1),
      one_liner: z.string().min(1),
      body: z.string().min(1),
      category: z.enum(EVENT_CATEGORIES),
      era_id: z.string().min(1),
      wiki_title: z.string().min(1),
    }),
  ),
});

type RawOutput = z.infer<typeof rawOutputSchema>;

const CATEGORY_ALIASES: Record<string, (typeof EVENT_CATEGORIES)[number]> = {
  SPORT: "CULTURE",
  SPORTS: "CULTURE",
  HISTORY: "CULTURE",
  POLITICS: "POLITICS",
  MILITARY: "MILITARY",
  MEDICINE: "SCIENCE",
  BIOLOGY: "SCIENCE",
  ENGINEERING: "SCIENCE",
  TECHNOLOGY: "SCIENCE",
  ECONOMICS: "ECONOMY",
  SOCIAL: "SOCIETY",
};

function normalizeCategory(raw: unknown): (typeof EVENT_CATEGORIES)[number] {
  const u = String(raw ?? "CULTURE").toUpperCase().trim();
  if ((EVENT_CATEGORIES as readonly string[]).includes(u)) {
    return u as (typeof EVENT_CATEGORIES)[number];
  }
  return CATEGORY_ALIASES[u] ?? "CULTURE";
}

function coerceRawPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const obj = { ...(data as Record<string, unknown>) };

  if (Array.isArray(obj.eras)) {
    obj.eras = obj.eras.map((era) => {
      if (!era || typeof era !== "object") return era;
      const e = era as Record<string, unknown>;
      return {
        ...e,
        id: String(e.id ?? "").trim(),
        name: String(e.name ?? "").trim(),
        start: Number(e.start),
        end: Number(e.end),
      };
    });
  }

  const eras = (obj.eras ?? []) as { id: string; name: string }[];
  const eraLookup = new Map<string, string>();
  eras.forEach((era, i) => {
    eraLookup.set(era.id, era.id);
    eraLookup.set(String(i + 1), era.id);
    eraLookup.set(era.name.toLowerCase(), era.id);
  });

  if (Array.isArray(obj.events)) {
    obj.events = obj.events.map((event) => {
      if (!event || typeof event !== "object") return event;
      const e = event as Record<string, unknown>;
      let eraId = String(e.era_id ?? "").trim();
      eraId = eraLookup.get(eraId) ?? eraLookup.get(eraId.toLowerCase()) ?? eraId;
      return {
        ...e,
        year_display: String(e.year_display ?? "").trim(),
        year_sort: typeof e.year_sort === "string" ? Number.parseInt(e.year_sort, 10) : Number(e.year_sort),
        title: String(e.title ?? "").trim(),
        one_liner: String(e.one_liner ?? "").trim(),
        body: String(e.body ?? "").trim(),
        category: normalizeCategory(e.category),
        era_id: eraId,
        wiki_title: String(e.wiki_title ?? "").trim().replace(/\s+/g, "_"),
      };
    });
  }

  return obj;
}

function parseRawOutput(text: string): RawOutput {
  const json = JSON.parse(extractJson(text));
  return rawOutputSchema.parse(coerceRawPayload(json));
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

const JUNK_TITLE = /^(chapter|section|part|unit|module)\s*[\d.:]+/i;

function isJunkEvent(e: RawOutput["events"][number]): boolean {
  const t = e.title.trim();
  if (JUNK_TITLE.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (!Number.isInteger(e.year_sort)) return false;
  // Obvious section-index years when title looks structural
  if (e.year_sort > 0 && e.year_sort < 50 && JUNK_TITLE.test(t)) return true;
  return false;
}

function validateAndNormalize(raw: RawOutput, slug: string): { events: TimelineEvent[]; eras: TimelineEra[] } {
  const eras: TimelineEra[] = raw.eras.map((e) => ({
    id: e.id.trim(),
    name: e.name.trim(),
    start: e.start,
    end: e.end,
  }));

  const eraIds = new Set(eras.map((e) => e.id));
  const seen = new Set<string>();
  const events: TimelineEvent[] = [];

  for (const e of raw.events) {
    if (isJunkEvent(e)) continue;
    if (!Number.isInteger(e.year_sort)) continue;
    if (!eraIds.has(e.era_id)) continue;

    const title = e.title.trim().split(/\s+/).slice(0, 8).join(" ");
    const key = `${e.year_sort}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const wikiTitle = e.wiki_title.trim().replace(/\s+/g, "_");
    events.push({
      id: `evt-${e.year_sort}-${titleToSlug(wikiTitle)}`,
      yearDisplay: e.year_display.trim(),
      yearSort: e.year_sort,
      sortKey: e.year_sort,
      precision: "year",
      title,
      oneLiner: e.one_liner.trim().slice(0, 160),
      body: e.body.trim(),
      category: e.category,
      eraId: e.era_id,
      tier: "landmark",
      wikiTitle,
      wikipediaSlug: titleToSlug(wikiTitle.replace(/_/g, " ")),
      image: null,
    });
  }

  events.sort((a, b) => a.yearSort - b.yearSort);
  return { events, eras };
}

function buildUserMessage(wikiTitle: string, articleText: string, maxChars: number): string {
  const text = trimArticleForLlm(articleText, maxChars);
  return `ARTICLE: ${wikiTitle}\n\n${text}\n\nJSON: {topic, eras:[{id,name,start,end}], events:[{year_display,year_sort,title,one_liner,body,category,era_id,wiki_title}]} — min ${MIN_EVENTS} dated events.`;
}

type TimelineMeta = {
  revisionId: number;
  cacheKey: string;
  supplements?: string[];
};

export async function generateTimeline(
  slug: string,
  topic: string,
  wikiTitle: string,
  articleText: string,
  sourceUrl: string,
  meta: TimelineMeta,
): Promise<TapsaTimeline> {
  const { apiKey, baseURL, models } = llmConfig();
  if (!apiKey) {
    throw new TimelineExtractionError("GROQ_API_KEY required for timeline generation.");
  }

  const client = new OpenAI({ apiKey, baseURL });

  const runExtraction = async (extra?: string) => {
    let lastErr: unknown;
    for (const charLimit of ARTICLE_CHAR_LIMITS) {
      const userMessage = buildUserMessage(wikiTitle, articleText, charLimit);
      const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: extra ? `${userMessage}\n\n${extra}` : userMessage,
        },
      ];

      for (const model of models) {
        try {
          const text = await chatWithRetry(client, model, msgs);
          const parsed = parseRawOutput(text);
          const { events, eras } = validateAndNormalize(parsed, slug);
          if (events.length < MIN_EVENTS) {
            throw new TimelineExtractionError(
              `Only ${events.length} valid events after validation (need ${MIN_EVENTS}).`,
            );
          }
          return { parsed, events, eras };
        } catch (err) {
          lastErr = err;
          if (isPayloadTooLarge(err)) break;
          if (isRateLimitError(err)) continue;
          throw err;
        }
      }
    }
    throw lastErr;
  };

  let result: { parsed: RawOutput; events: TimelineEvent[]; eras: TimelineEra[] };
  let firstMessage = "";
  try {
    result = await runExtraction();
  } catch (firstErr) {
    if (isRateLimitError(firstErr)) {
      throw new TimelineExtractionError(
        firstErr instanceof Error ? firstErr.message : String(firstErr),
      );
    }
    firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);
    try {
      result = await runExtraction(
        `Validation failed (${firstMessage}). Return valid JSON with ≥${MIN_EVENTS} dated events. No section headings as events.`,
      );
    } catch (secondErr) {
      if (isRateLimitError(secondErr)) {
        throw new TimelineExtractionError(
          secondErr instanceof Error ? secondErr.message : String(secondErr),
        );
      }
      throw new TimelineExtractionError(
        `Timeline extraction failed after retry. First error: ${firstMessage}`,
      );
    }
  }

  return {
    slug,
    title: topic.trim() || result.parsed.topic.trim(),
    topic: result.parsed.topic.trim() || topic,
    events: result.events.slice(0, MAX_EVENTS),
    eras: result.eras,
    sourceUrl,
    generatedAt: new Date().toISOString(),
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    origin: "llm",
    wikiTitle,
    revisionId: meta.revisionId,
    cacheKey: meta.cacheKey,
    topicType: "CONCEPT",
    orientation: result.parsed.topic.trim(),
    sparse: result.events.length < 5,
  };
}

/** Export raw extraction JSON for verification scripts. */
export async function extractTimelineJson(
  wikiTitle: string,
  articleText: string,
): Promise<RawOutput> {
  const { apiKey, baseURL, models } = llmConfig();
  if (!apiKey) throw new Error("GROQ_API_KEY required.");
  const client = new OpenAI({ apiKey, baseURL });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: EXTRACTION_SYSTEM },
    { role: "user", content: buildUserMessage(wikiTitle, articleText, ARTICLE_CHAR_LIMITS[0]) },
  ];
  const text = await chatWithRetry(client, models[0], messages);
  const parsed = parseRawOutput(text);
  const { events } = validateAndNormalize(parsed, "verify");
  if (events.length < MIN_EVENTS) {
    throw new Error(`Validation left only ${events.length} events.`);
  }
  return parsed;
}
