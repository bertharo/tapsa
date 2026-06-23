import OpenAI from "openai";
import { z } from "zod";
import type { Connection, Domain, Grounding, RelationshipType, TapsaNode } from "./types";
import { RELATIONSHIP_TYPES, SCHEMA_VERSION } from "./types";

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

const SYSTEM_PROMPT = `You are the connection engine for Tapsa, a learning tool. \
You receive a topic (the ANCHOR), its factual summary, and a list of candidate related topics (the TARGETS — all real Wikipedia pages, so a real link already exists). \
Your job:
1. Rewrite the summary into 2-3 tight, confident sentences. No hedging, no "is a term that", no filler. Encyclopedic but modern.
2. Select the ${MIN_CONNECTIONS}-${MAX_CONNECTIONS} BEST connections. Favor substantive, STRUCTURAL links a curious person would genuinely want to explore — the defining people, places, ideas, and closely related topics. Include AT LEAST ONE non-obvious, intellectually surprising link. AVOID trivia, narrow date/event stubs (specific seasons, finals, drafts by year), and purely categorical links.
3. For EACH selected connection, output:
   - "relationship": the ONE label from this fixed vocabulary that most precisely fits how the ANCHOR relates to the TARGET: ${RELATIONSHIP_TYPES.map((t) => `"${t}"`).join(", ")}. Choose the most specific structural fit.
   - "rationale": ONE precise sentence stating specifically HOW the anchor connects to the target — the actual mechanism or link, grounded ONLY in the provided summary. Not "they are related"; state the concrete connection. Max ~22 words. Never begin with filler like "This connection".
4. Only include a connection if you can state a REAL, specific, grounded relationship. If a candidate has no genuine articulable connection, OMIT it — never invent one to pad the list.
5. Mark EXACTLY ONE connection as "surprising": true — the adjacent idea most curious people wouldn't think to explore from this topic. It should reward the click.

Hard rules:
- You may ONLY choose connections whose slug appears in the provided candidate list. Never invent a slug or topic.
- "relationship" MUST be exactly one of the allowed values, verbatim.
- Never invent facts not present in the source summary.
- Respond ONLY with valid JSON matching the schema. No prose, no markdown, no code fences.`;

const llmOutputSchema = z.object({
  summary: z.string().min(1),
  connections: z
    .array(
      z.object({
        slug: z.string().min(1),
        // Lenient on purpose: an off-vocabulary label drops only its own type
        // (in reconcile), never the whole batch.
        relationship: z.string().optional(),
        rationale: z.string().min(1),
        surprising: z.boolean(),
      }),
    )
    .min(MIN_CONNECTIONS)
    .max(MAX_CONNECTIONS),
});

/** Map a model-supplied label to the fixed vocabulary, or undefined if it doesn't fit. */
function normalizeRelationship(raw?: string): RelationshipType | undefined {
  if (!raw) return undefined;
  const r = raw.trim().toLowerCase();
  return RELATIONSHIP_TYPES.find((t) => t === r);
}

function buildUserMessage(g: Grounding): string {
  const candidateList = g.candidates
    .map((c) => `- slug: ${c.slug} | title: ${c.title}`)
    .join("\n");
  return `ANCHOR TOPIC: ${g.title}
SLUG: ${g.slug}

FACTUAL SUMMARY (source of truth, do not contradict):
${g.summary}

CANDIDATE CONNECTIONS — the TARGETS (choose only from these slugs):
${candidateList}

Return JSON: { "summary": string, "connections": [{ "slug": string, "relationship": string, "rationale": string, "surprising": boolean }] }`;
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
      relationship: normalizeRelationship(c.relationship),
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
function fallbackGenerate(g: Grounding, domain?: Domain): TapsaNode {
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
    lead: g.lead,
    sourceUrl: g.sourceUrl,
    domain,
    connections,
    sections: [],
    kind: "article",
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

async function generateWithLLM(g: Grounding, domain?: Domain): Promise<TapsaNode> {
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
    lead: g.lead,
    sourceUrl: g.sourceUrl,
    domain,
    connections,
    sections: [],
    kind: "article",
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    origin: "llm",
  };
}

const SECTION_SYSTEM_PROMPT = `You are the connection engine for Tapsa. You receive one section of a Wikipedia article and rewrite it into 2-3 tight, confident, engaging sentences in Tapsa's voice. No hedging, no filler, no markdown. Never invent facts not in the provided text. Respond with the rewritten summary text only — no preamble, no quotes.`;

/**
 * Summarize a single article section into Tapsa's voice. Falls back to a clean
 * sentence trim of the source text when no key is configured or on error.
 */
export async function summarizeSection(
  articleTitle: string,
  sectionTitle: string,
  sectionText: string,
): Promise<{ summary: string; origin: "llm" | "fallback" }> {
  const trimmed = sectionText.trim();
  if (!trimmed) {
    return { summary: `This section of ${articleTitle} has no extractable text.`, origin: "fallback" };
  }
  const { apiKey, baseURL, model } = llmConfig();
  if (!apiKey) {
    return { summary: trimToSentences(trimmed, 3), origin: "fallback" };
  }
  try {
    const client = new OpenAI({ apiKey, baseURL });
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 400,
      temperature: 0.5,
      messages: [
        { role: "system", content: SECTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `ARTICLE: ${articleTitle}\nSECTION: ${sectionTitle}\n\nSECTION TEXT:\n${trimmed.slice(0, 1800)}`,
        },
      ],
    });
    const text = resp.choices[0]?.message?.content?.trim();
    if (!text) return { summary: trimToSentences(trimmed, 3), origin: "fallback" };
    return { summary: text, origin: "llm" };
  } catch (err) {
    console.error("[tapsa] section summary failed, using fallback:", err);
    return { summary: trimToSentences(trimmed, 3), origin: "fallback" };
  }
}

/** Generate a Tapsa node from grounding. Uses the LLM if a key is configured, else falls back. */
export async function generateNode(
  g: Grounding,
  domain?: Domain,
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
