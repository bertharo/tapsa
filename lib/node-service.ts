import type { Domain, TapsaNode } from "./types";
import { getStore } from "./cache";
import { fetchGrounding, TopicNotFoundError } from "./wikipedia";
import { generateNode } from "./llm";
import { recordNodeEvent } from "./metrics";

export { TopicNotFoundError };

const SCIENCE_HINTS = [
  "physics",
  "chemistry",
  "biology",
  "quantum",
  "particle",
  "molecule",
  "cell",
  "gene",
  "energy",
  "galaxy",
  "planet",
  "star",
  "theorem",
  "equation",
  "evolution",
  "species",
  "atom",
  "neuron",
  "disease",
  "organism",
  "mathematics",
  "geology",
  "climate",
];

const HISTORY_HINTS = [
  "empire",
  "war",
  "revolution",
  "century",
  "ancient",
  "dynasty",
  "king",
  "queen",
  "battle",
  "civilization",
  "medieval",
  "treaty",
  "republic",
  "monarch",
  "colonial",
  "renaissance",
  "kingdom",
  "bc",
  "ad",
];

/** Lightweight domain inference (science + history are the only v1 domains). */
function inferDomain(text: string): Domain {
  const t = text.toLowerCase();
  const score = (hints: string[]) =>
    hints.reduce((n, h) => (t.includes(h) ? n + 1 : n), 0);
  return score(HISTORY_HINTS) > score(SCIENCE_HINTS) ? "history" : "science";
}

export type NodeResult = { node: TapsaNode; cacheHit: boolean };

/**
 * The core pipeline: cache check → Wikipedia grounding → LLM generation →
 * write to cache → return. Caching is permanent and keyed by canonical slug.
 */
export async function getOrCreateNode(
  slug: string,
  hintedDomain?: Domain,
): Promise<NodeResult> {
  const store = getStore();

  const cached = await store.get(slug);
  if (cached) {
    recordNodeEvent({ kind: "cache_hit", slug });
    return { node: cached, cacheHit: true };
  }

  const startedAt = Date.now();
  const grounding = await fetchGrounding(slug);

  // The grounding may resolve a redirect to a different canonical slug; check
  // the cache again under the canonical slug before paying to generate.
  if (grounding.slug !== slug) {
    const canonicalCached = await store.get(grounding.slug);
    if (canonicalCached) {
      recordNodeEvent({ kind: "cache_hit", slug: grounding.slug });
      return { node: canonicalCached, cacheHit: true };
    }
  }

  const domain = hintedDomain ?? inferDomain(`${grounding.title} ${grounding.summary}`);
  const node = await generateNode(grounding, domain);
  await store.set(node);

  recordNodeEvent({
    kind: "cold_generation",
    slug: node.slug,
    origin: node.origin,
    ms: Date.now() - startedAt,
  });

  return { node, cacheHit: false };
}

/** Read-only cache lookup (used by deep-link pages that shouldn't trigger cold gen on render). */
export async function peekNode(slug: string): Promise<TapsaNode | null> {
  return getStore().get(slug);
}
