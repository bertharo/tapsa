import OpenAI from "openai";
import { z } from "zod";
import type { Connection, Domain, Grounding, TapsaNode } from "./types";
import { SCHEMA_VERSION } from "./types";

/**
 * Model layer. Talks to any OpenAI-compatible endpoint; defaults to Groq
 * (fast, cheap open-model inference). Swap the provider entirely via env:
 *   TAPSA_LLM_BASE_URL, TAPSA_MODEL, and GROQ_API_KEY (or TAPSA_LLM_API_KEY).
 *
 * Env is read at call time (not module load) so batch scripts that load
 * .env.local after importing this module still pick up the configuration.
 */
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MIN_CONNECTIONS = 3;
const MAX_CONNECTIONS = 6;

function llmConfig() {
  return {
    baseURL: process.env.TAPSA_LLM_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.TAPSA_MODEL ?? DEFAULT_MODEL,
    apiKey: process.env.GROQ_API_KEY ?? process.env.TAPSA_LLM_API_KEY ?? "",
  };
}

const SYSTEM_PROMPT = `You are the connection engine for Tapsa, a knowledge-exploration tool. \
You receive a topic, its factual summary, and a list of candidate related topics (all real Wikipedia pages). \
Your job:
1. Rewrite the summary into 2-3 tight, confident sentences. No hedging, no "is a term that", no filler. Encyclopedic but modern.
2. Select the ${MIN_CONNECTIONS}-${MAX_CONNECTIONS} MOST INTERESTING connections, strongly favoring non-obvious, intellectually surprising links over generic or purely categorical ones.
3. Write a punchy one-line rationale for each connection (max ~14 words): the specific, concrete reason this link is worth exploring. Start with the substance — NEVER with filler like "This connection is worth exploring because" or "X is relevant because". No restating the obvious.
4. Mark EXACTLY ONE connection as "surprising": true — the adjacent idea most curious people wouldn't think to explore from this topic. It should reward the click.

Hard rules:
- You may ONLY choose connections whose slug appears in the provided candidate list. Never invent a slug or topic.
- Never invent facts not present in the source summary.
- Respond ONLY with valid JSON matching the schema. No prose, no markdown, no code fences.`;

const llmOutputSchema = z.object({
  summary: z.string().min(1),
  connections: z
    .array(
      z.object({
        slug: z.string().min(1),
        rationale: z.string().min(1),
        surprising: z.boolean(),
      }),
    )
    .min(MIN_CONNECTIONS)
    .max(MAX_CONNECTIONS),
});

function buildUserMessage(g: Grounding): string {
  const candidateList = g.candidates
    .map((c) => `- slug: ${c.slug} | title: ${c.title}`)
    .join("\n");
  return `TOPIC: ${g.title}
SLUG: ${g.slug}

FACTUAL SUMMARY (source of truth, do not contradict):
${g.summary}

CANDIDATE CONNECTIONS (choose only from these slugs):
${candidateList}

Return JSON: { "summary": string, "connections": [{ "slug": string, "rationale": string, "surprising": boolean }] }`;
}

/** Strip accidental code fences / leading prose to find the JSON object. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

/**
 * Map validated LLM connections back onto real candidate links. This is the
 * guardrail that prevents hallucinated / dead links: any chosen slug not in the
 * candidate set is dropped, and titles always come from the candidate source.
 */
function reconcileConnections(
  chosen: z.infer<typeof llmOutputSchema>["connections"],
  g: Grounding,
): Connection[] {
  const bySlug = new Map(g.candidates.map((c) => [c.slug, c]));
  const out: Connection[] = [];
  const seen = new Set<string>();
  for (const c of chosen) {
    const real = bySlug.get(c.slug);
    if (!real || seen.has(real.slug)) continue;
    seen.add(real.slug);
    out.push({
      slug: real.slug,
      title: real.title,
      rationale: c.rationale.trim(),
      surprising: c.surprising,
    });
  }
  return ensureExactlyOneSurprising(out);
}

/** Guarantee exactly one "what you missed" node, even if the model slips. */
function ensureExactlyOneSurprising(connections: Connection[]): Connection[] {
  if (connections.length === 0) return connections;
  const surprisingIdx = connections.findIndex((c) => c.surprising);
  if (surprisingIdx === -1) {
    // Default the last (often least obvious) connection to surprising.
    connections[connections.length - 1].surprising = true;
  } else {
    connections.forEach((c, i) => {
      c.surprising = i === surprisingIdx;
    });
  }
  return connections;
}

/** Heuristic generation used when no API key is configured (keeps app demoable). */
function fallbackGenerate(g: Grounding, domain: Domain): TapsaNode {
  const picked: Connection[] = g.candidates.slice(0, MAX_CONNECTIONS).map((c, i) => ({
    slug: c.slug,
    title: c.title,
    rationale: `Closely related to ${g.title}.`,
    // Mark a mid-list candidate so the UI still has its signature "missed" node.
    surprising: i === Math.min(2, Math.min(MAX_CONNECTIONS, g.candidates.length) - 1),
  }));
  const connections = ensureExactlyOneSurprising(picked);
  const summary = trimToSentences(g.summary, 3);
  return {
    slug: g.slug,
    title: g.title,
    summary,
    sourceUrl: g.sourceUrl,
    domain,
    connections,
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    origin: "fallback",
  };
}

function trimToSentences(text: string, max: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return text.trim();
  return sentences.slice(0, max).join(" ").trim();
}

async function generateWithLLM(g: Grounding, domain: Domain): Promise<TapsaNode> {
  const { apiKey, baseURL, model } = llmConfig();
  const client = new OpenAI({ apiKey, baseURL });
  const userMessage = buildUserMessage(g);

  const attempt = async (extra?: string) => {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      // Low-ish: factual rewrite must be tight; selection still has room to vary.
      temperature: 0.6,
      // Native JSON mode — more reliable than prompt-only, supported by Groq.
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
    // Retry once on parse/validation failure, per the spec.
    parsed = await attempt(
      "Your previous response was not valid JSON matching the schema. Respond ONLY with the JSON object.",
    );
  }

  const connections = reconcileConnections(parsed.connections, g);
  if (connections.length < MIN_CONNECTIONS) {
    // Top up from candidates so the map is never too sparse.
    const have = new Set(connections.map((c) => c.slug));
    for (const c of g.candidates) {
      if (connections.length >= MIN_CONNECTIONS) break;
      if (have.has(c.slug)) continue;
      connections.push({
        slug: c.slug,
        title: c.title,
        rationale: `Related to ${g.title}.`,
        surprising: false,
      });
    }
    ensureExactlyOneSurprising(connections);
  }

  return {
    slug: g.slug,
    title: g.title,
    summary: parsed.summary.trim(),
    sourceUrl: g.sourceUrl,
    domain,
    connections,
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    origin: "llm",
  };
}

/** Generate a Tapsa node from grounding. Uses the LLM if a key is configured, else falls back. */
export async function generateNode(
  g: Grounding,
  domain: Domain,
): Promise<TapsaNode> {
  if (!llmConfig().apiKey) {
    return fallbackGenerate(g, domain);
  }
  try {
    return await generateWithLLM(g, domain);
  } catch (err) {
    console.error("[tapsa] LLM generation failed, using fallback:", err);
    return fallbackGenerate(g, domain);
  }
}
