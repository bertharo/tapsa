import { createHash } from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import type { TapsaTimeline, TimelineEra, TimelineEvent } from "./timeline-types";
import { fetchWithRetry } from "./timeline-fetch";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_OUTPUT_TOKENS_ORIENTATION = 120;
const MAX_OUTPUT_TOKENS_ERA = 1800;

const OrientationSchema = z.object({
  orientation: z.string().min(12).max(280),
});

const EraBatchSchema = z.object({
  eras: z.array(
    z.object({
      eraId: z.string(),
      label: z.string().optional(),
      summary: z.string().min(8).max(280),
      events: z.array(
        z.object({
          id: z.string(),
          title: z.string().min(3).max(80),
          summary: z.string().min(12).max(320),
          significance: z.string().min(12).max(220),
        }),
      ),
    }),
  ),
});

function editorialConfig() {
  return {
    baseURL: process.env.TAPSA_LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY ?? process.env.TAPSA_LLM_API_KEY ?? "",
    model: process.env.TAPSA_TIMELINE_EDITORIAL_MODEL ?? DEFAULT_MODEL,
  };
}

function editorialClient(): OpenAI | null {
  const { apiKey, baseURL } = editorialConfig();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL, fetch: fetchWithRetry as typeof fetch });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() ?? trimmed;
  return JSON.parse(raw);
}

async function callEditorial(system: string, user: string, maxTokens: number): Promise<unknown | null> {
  const client = editorialClient();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: editorialConfig().model,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = response.choices[0]?.message?.content ?? "";
    if (!text) return null;
    return extractJson(text);
  } catch {
    return null;
  }
}

const EDITORIAL_SYSTEM = `You compress Wikipedia extracts into timeline copy. Rules:
- Output strict JSON only, no markdown.
- Rephrase only facts present in the provided extract text.
- Never invent names, dates, places, or outcomes.
- title: max 8 words, states what happened.
- summary: 1-2 sentences, must NOT restate the title.
- significance: one sentence on why it mattered to this topic's story.
- Do not copy the title into the summary.`;

export function timelineContentHash(timeline: Pick<TapsaTimeline, "wikiTitle" | "events">): string {
  const payload = timeline.events
    .map((e) => `${e.id}|${e.body.slice(0, 400)}`)
    .join("\n");
  return createHash("sha256")
    .update(`${timeline.wikiTitle}\n${payload}`)
    .digest("hex")
    .slice(0, 16);
}

function chunkEras(
  eras: TimelineEra[],
  events: TimelineEvent[],
  maxBatches: number,
): { era: TimelineEra; events: TimelineEvent[] }[][] {
  const groups = eras.map((era) => ({
    era,
    events: events.filter((e) => e.eraId === era.id),
  }));
  const nonEmpty = groups.filter((g) => g.events.length > 0);
  if (!nonEmpty.length) return [];

  const batchSize = Math.max(1, Math.ceil(nonEmpty.length / maxBatches));
  const batches: { era: TimelineEra; events: TimelineEvent[] }[][] = [];
  for (let i = 0; i < nonEmpty.length; i += batchSize) {
    batches.push(nonEmpty.slice(i, i + batchSize));
  }
  return batches;
}

async function editOrientation(topicTitle: string, leadExtract: string): Promise<string | null> {
  const parsed = await callEditorial(
    EDITORIAL_SYSTEM,
    JSON.stringify({
      task: "orientation",
      topic: topicTitle,
      extract: leadExtract.slice(0, 1200),
      schema: { orientation: "one sentence on why this topic matters" },
    }),
    MAX_OUTPUT_TOKENS_ORIENTATION,
  );
  if (!parsed) return null;
  const result = OrientationSchema.safeParse(parsed);
  return result.success ? result.data.orientation : null;
}

async function editEraBatch(
  topicTitle: string,
  batch: { era: TimelineEra; events: TimelineEvent[] }[],
): Promise<z.infer<typeof EraBatchSchema> | null> {
  const payload = {
    task: "era_batch",
    topic: topicTitle,
    eras: batch.map(({ era, events }) => ({
      eraId: era.id,
      eraLabel: era.name,
      events: events.map((e) => ({
        id: e.id,
        extract: e.body.slice(0, 500),
      })),
    })),
    schema: {
      eras: [
        {
          eraId: "string",
          label: "optional improved era label",
          summary: "one sentence chapter summary",
          events: [{ id: "string", title: "string", summary: "string", significance: "string" }],
        },
      ],
    },
  };

  const parsed = await callEditorial(
    EDITORIAL_SYSTEM,
    JSON.stringify(payload),
    MAX_OUTPUT_TOKENS_ERA,
  );
  if (!parsed) return null;
  const result = EraBatchSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** LLM editorial pass — returns input unchanged when API is missing or fails. */
export async function applyTimelineEditorial(
  timeline: TapsaTimeline,
  leadExtract: string,
): Promise<TapsaTimeline> {
  if (!editorialClient()) return timeline;

  const orientation = await editOrientation(timeline.title, leadExtract);
  const eraBatches = chunkEras(timeline.eras, timeline.events, 3);

  const eventUpdates = new Map<string, { title: string; oneLiner: string; significance: string }>();
  const eraUpdates = new Map<string, { name?: string; summary: string }>();

  for (const batch of eraBatches) {
    const edited = await editEraBatch(timeline.title, batch);
    if (!edited) continue;
    for (const eraBlock of edited.eras) {
      eraUpdates.set(eraBlock.eraId, {
        name: eraBlock.label,
        summary: eraBlock.summary,
      });
      for (const ev of eraBlock.events) {
        eventUpdates.set(ev.id, {
          title: ev.title,
          oneLiner: ev.summary,
          significance: ev.significance,
        });
      }
    }
  }

  if (!orientation && eventUpdates.size === 0 && eraUpdates.size === 0) {
    return timeline;
  }

  const events = timeline.events.map((ev) => {
    const patch = eventUpdates.get(ev.id);
    if (!patch) return ev;
    return {
      ...ev,
      title: patch.title,
      oneLiner: patch.oneLiner,
      significance: patch.significance,
    };
  });

  const eras = timeline.eras.map((era) => {
    const patch = eraUpdates.get(era.id);
    if (!patch) return era;
    return {
      ...era,
      name: patch.name && patch.name.length > 2 ? patch.name : era.name,
      summary: patch.summary,
    };
  });

  return {
    ...timeline,
    orientation: orientation ?? timeline.orientation,
    events,
    eras,
    contentHash: timelineContentHash({ wikiTitle: timeline.wikiTitle, events }),
  };
}
