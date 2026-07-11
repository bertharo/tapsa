import OpenAI from "openai";
import { z } from "zod";
import type { TapsaTimeline, TimelineEra, TimelineEvent } from "./timeline-types";
import { EVENT_CATEGORIES, TIMELINE_SCHEMA_VERSION } from "./timeline-types";
import { titleToSlug } from "./slug";

const MIN_EVENTS = 18;
const MAX_EVENTS = 30;

function llmConfig() {
  return {
    baseURL: process.env.TAPSA_LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
    model: process.env.TAPSA_MODEL ?? "llama-3.3-70b-versatile",
    apiKey: process.env.GROQ_API_KEY ?? process.env.TAPSA_LLM_API_KEY ?? "",
  };
}

const SYSTEM_PROMPT = `You are the timeline engine for Tapsa Timelines, an interactive historical explorer.
You receive a topic and a factual Wikipedia summary. Produce a cinematic timeline of that topic's history.

Rules:
- Return 18–30 events spanning the topic's full history (ancient to present when applicable).
- Events must be factually grounded in the summary; do not invent major events.
- Each event: year (integer; negative for BCE), optional yearEnd for ranges, yearLabel for display,
  title (max 8 words), hook (one sentence), detail (3–4 sentences), era label, significance 1–3,
  category (war|invention|person|culture|economy|science), wikipedia_slug (kebab-case of a real Wikipedia article).
- Return 2–4 era objects grouping events: name, startYear, endYear (negative for BCE), one-line description.
- Sort events chronologically by year.
- Prefer diverse categories and mix well-known milestones with lesser-known turning points.
- Respond ONLY with valid JSON. No prose, no markdown, no code fences.`;

const llmOutputSchema = z.object({
  title: z.string().min(1),
  eras: z
    .array(
      z.object({
        name: z.string().min(1),
        startYear: z.number(),
        endYear: z.number(),
        description: z.string().min(1),
      }),
    )
    .min(2)
    .max(4),
  events: z
    .array(
      z.object({
        year: z.number(),
        yearEnd: z.number().optional(),
        yearLabel: z.string().min(1),
        title: z.string().min(1),
        hook: z.string().min(1),
        detail: z.string().min(1),
        era: z.string().min(1),
        significance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        category: z.enum(EVENT_CATEGORIES),
        wikipedia_slug: z.string().min(1),
        wikipedia_title: z.string().min(1),
      }),
    )
    .min(MIN_EVENTS)
    .max(MAX_EVENTS),
});

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function formatYearLabel(year: number, yearEnd?: number): string {
  const fmt = (y: number) => (y < 0 ? `${Math.abs(y)} BCE` : `${y}`);
  if (yearEnd !== undefined && yearEnd !== year) return `${fmt(year)}–${fmt(yearEnd)}`;
  return fmt(year);
}

function normalizeEvent(
  raw: z.infer<typeof llmOutputSchema>["events"][number],
  idx: number,
): TimelineEvent {
  const slug = titleToSlug(raw.wikipedia_title) || raw.wikipedia_slug.replace(/_/g, "-");
  return {
    id: `evt-${idx}-${slug}`,
    year: raw.year,
    yearEnd: raw.yearEnd,
    yearLabel: raw.yearLabel || formatYearLabel(raw.year, raw.yearEnd),
    title: raw.title.split(/\s+/).slice(0, 8).join(" "),
    hook: raw.hook.trim(),
    detail: raw.detail.trim(),
    era: raw.era.trim(),
    significance: raw.significance,
    category: raw.category,
    wikipediaSlug: slug,
    wikipediaTitle: raw.wikipedia_title.trim(),
  };
}

function normalizeEras(raw: z.infer<typeof llmOutputSchema>["eras"]): TimelineEra[] {
  return raw.map((e, i) => ({
    id: `era-${i}-${titleToSlug(e.name)}`,
    name: e.name.trim(),
    startYear: e.startYear,
    endYear: e.endYear,
    description: e.description.trim(),
  }));
}

export async function generateTimeline(
  slug: string,
  topic: string,
  wikiTitle: string,
  wikiSummary: string,
  sourceUrl: string,
): Promise<TapsaTimeline> {
  const { apiKey, baseURL, model } = llmConfig();
  if (!apiKey) {
    return fallbackTimeline(slug, topic, wikiTitle, wikiSummary, sourceUrl);
  }

  const client = new OpenAI({ apiKey, baseURL });
  const userMessage = `TOPIC: ${topic}
WIKIPEDIA TITLE: ${wikiTitle}

FACTUAL SUMMARY (source of truth):
${wikiSummary.slice(0, 3500)}

Return JSON:
{
  "title": string,
  "eras": [{ "name": string, "startYear": number, "endYear": number, "description": string }],
  "events": [{
    "year": number, "yearEnd"?: number, "yearLabel": string, "title": string,
    "hook": string, "detail": string, "era": string, "significance": 1|2|3,
    "category": "war"|"invention"|"person"|"culture"|"economy"|"science",
    "wikipedia_slug": string, "wikipedia_title": string
  }]
}`;

  const attempt = async (extra?: string) => {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: extra ? `${userMessage}\n\n${extra}` : userMessage },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? "";
    return llmOutputSchema.parse(JSON.parse(extractJson(text)));
  };

  let parsed: z.infer<typeof llmOutputSchema>;
  try {
    parsed = await attempt();
  } catch {
    parsed = await attempt(
      "Your previous response was not valid JSON matching the schema. Respond ONLY with the JSON object.",
    );
  }

  const events = parsed.events
    .map((e, i) => normalizeEvent(e, i))
    .sort((a, b) => a.year - b.year);

  return {
    slug,
    title: parsed.title.trim(),
    topic,
    events,
    eras: normalizeEras(parsed.eras),
    sourceUrl,
    generatedAt: new Date().toISOString(),
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    origin: "llm",
  };
}

/** Minimal timeline when no API key — keeps the feature demoable. */
function fallbackTimeline(
  slug: string,
  topic: string,
  wikiTitle: string,
  wikiSummary: string,
  sourceUrl: string,
): TapsaTimeline {
  const sentences = wikiSummary.match(/[^.!?]+[.!?]+/g) ?? [wikiSummary];
  const chunk = Math.max(1, Math.floor(sentences.length / MIN_EVENTS));
  const events: TimelineEvent[] = [];
  for (let i = 0; i < MIN_EVENTS && i * chunk < sentences.length; i++) {
    const year = -500 + i * 150;
    events.push({
      id: `evt-fb-${i}`,
      year,
      yearLabel: formatYearLabel(year),
      title: `Chapter ${i + 1}`,
      hook: sentences[i * chunk]?.trim() ?? `A moment in the history of ${topic}.`,
      detail: sentences.slice(i * chunk, i * chunk + 3).join(" ").trim(),
      era: i < 6 ? "Early history" : i < 12 ? "Middle period" : "Modern era",
      significance: (i % 3) + 1 as 1 | 2 | 3,
      category: "culture",
      wikipediaSlug: slug,
      wikipediaTitle: wikiTitle,
    });
  }

  const minY = events[0]?.year ?? -500;
  const maxY = events[events.length - 1]?.year ?? 2000;

  return {
    slug,
    title: `History of ${topic}`,
    topic,
    events,
    eras: [
      {
        id: "era-fb-0",
        name: "Origins",
        startYear: minY,
        endYear: minY + (maxY - minY) * 0.4,
        description: `Early development of ${topic}.`,
      },
      {
        id: "era-fb-1",
        name: "Transformation",
        startYear: minY + (maxY - minY) * 0.4,
        endYear: maxY,
        description: `How ${topic} evolved into its modern form.`,
      },
    ],
    sourceUrl,
    generatedAt: new Date().toISOString(),
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    origin: "fallback",
  };
}
