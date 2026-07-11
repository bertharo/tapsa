import OpenAI from "openai";
import { z } from "zod";
import type { TapsaTimeline, TimelineEra, TimelineEvent } from "./timeline-types";
import { EVENT_CATEGORIES, TIMELINE_SCHEMA_VERSION } from "./timeline-types";
import { titleToSlug } from "./slug";

const MIN_EVENTS = 8;
const MAX_EVENTS = 30;
const MAX_ARTICLE_CHARS = 9000;
const MAX_OUTPUT_TOKENS = 4096;

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

function parseRetryAfterMs(message: string): number | null {
  const m = message.match(/try again in (?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = m[2] ? Number(m[2]) : 0;
  if (!minutes && !seconds) return null;
  return Math.ceil((minutes * 60 + seconds) * 1000);
}

function trimArticleForLlm(text: string): string {
  if (text.length <= MAX_ARTICLE_CHARS) return text;
  const head = Math.floor(MAX_ARTICLE_CHARS * 0.72);
  const tail = MAX_ARTICLE_CHARS - head - 48;
  return `${text.slice(0, head)}\n\n[…middle of article omitted for length…]\n\n${text.slice(-tail)}`;
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
      if (!isRateLimitError(err) || attempt === 3) break;
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

const EXTRACTION_SYSTEM = `You are a structured-event extraction engine for Tapsa Timelines.
You receive the full plain-text body of one or more Wikipedia articles about a topic. Extract real dated historical events.

An event is something that HAPPENED at a time: a publication, discovery, observation, invention, founding, death, launch, premiere, battle, treaty.
Section headings, chapter titles, topic names, and table-of-contents labels are NEVER events.

Hard rules:
1. Every event must have a defensible date grounded in the article text. If no date can be grounded, DROP the event — never default, never guess, never reuse a section index as a year.
2. Return 12–30 events for a rich article (minimum 8). Spread across the full time range.
3. title names the EVENT in max 8 words (name who did what, not just the concept — not "Expansion" or "Chapter 7").
4. Group into 3–5 named eras that partition the time range; every event maps to exactly one era_id. Era names must reflect THIS topic's own history — a person's life stages, an empire's periods, a technology's generations — never generic placeholders like "Era 1".
5. year_sort is a signed integer for ordering (BC is negative). year_display is the human string ("1915", "c. 300 BC", "1964–1968").
6. wiki_title is the most relevant Wikipedia article title using underscores.
7. category is one of: SCIENCE, MATHEMATICS, PHYSICS, ASTRONOMY, OBSERVATION, PHILOSOPHY, CULTURE, TECHNOLOGY.
8. topic must be the resolved article title.
9. Output raw JSON only — no markdown fences, no preamble.`;

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
      title,
      oneLiner: e.one_liner.trim().slice(0, 160),
      body: e.body.trim(),
      category: e.category,
      eraId: e.era_id,
      wikiTitle,
      wikipediaSlug: titleToSlug(wikiTitle.replace(/_/g, " ")),
    });
  }

  events.sort((a, b) => a.yearSort - b.yearSort);
  return { events, eras };
}

function buildUserMessage(wikiTitle: string, articleText: string): string {
  const text = trimArticleForLlm(articleText);
  return `ARTICLE: ${wikiTitle}

${text}

Return JSON: { topic, eras:[{id,name,start,end}], events:[{year_display,year_sort,title,one_liner,body,category,era_id,wiki_title}] }
Minimum ${MIN_EVENTS} real dated events. Raw JSON only.`;
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
  const userMessage = buildUserMessage(wikiTitle, articleText);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: EXTRACTION_SYSTEM },
    { role: "user", content: userMessage },
  ];

  const runExtraction = async (extra?: string) => {
    const msgs = extra
      ? [...messages.slice(0, 1), { role: "user" as const, content: `${userMessage}\n\n${extra}` }]
      : messages;

    let lastErr: unknown;
    for (const model of models) {
      try {
        const text = await chatWithRetry(client, model, msgs);
        const parsed = rawOutputSchema.parse(JSON.parse(extractJson(text)));
        const { events, eras } = validateAndNormalize(parsed, slug);
        if (events.length < MIN_EVENTS) {
          throw new TimelineExtractionError(
            `Only ${events.length} valid events after validation (need ${MIN_EVENTS}).`,
          );
        }
        return { parsed, events, eras };
      } catch (err) {
        lastErr = err;
        if (isRateLimitError(err)) continue;
        throw err;
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
    { role: "user", content: buildUserMessage(wikiTitle, articleText) },
  ];
  const text = await chatWithRetry(client, models[0], messages);
  const parsed = rawOutputSchema.parse(JSON.parse(extractJson(text)));
  const { events } = validateAndNormalize(parsed, "verify");
  if (events.length < MIN_EVENTS) {
    throw new Error(`Validation left only ${events.length} events.`);
  }
  return parsed;
}
