import type { Connection, TapsaNode } from "./types";

/**
 * Familiarity model. Learning comes from linking the NEW to something the
 * learner already KNOWS, so every predict-then-reveal card pairs an anchor
 * (familiar) with a target (the exploration). We persist a lightweight set of
 * "I know this" slugs client-side and use it to choose that pairing.
 */
export const FAMILIARITY_STORAGE_KEY = "tapsa:known-v1";

export type PredictPair = {
  /** Something the learner already knows — the anchor for the comparison. */
  anchor: { slug: string; title: string };
  /** The new thing being connected to the anchor. */
  target: Connection;
};

/**
 * Choose the (anchor, target) pairing for a predict card.
 *
 * The current node is the natural anchor — it's what the learner is looking at.
 * The target is the connection they're LEAST likely to already know, so the
 * reveal teaches something; if they know all of them, we fall back to the
 * "surprising" connection. We never pair two unknowns: when the anchor itself
 * isn't yet marked known, `anchorIsKnown` is false so the caller can prompt the
 * learner to anchor on it first (mark "I know this") before predicting.
 */
export function pickPredictPair(
  node: TapsaNode,
  known: ReadonlySet<string>,
): (PredictPair & { anchorIsKnown: boolean }) | null {
  if (node.connections.length === 0) return null;

  const unknownTargets = node.connections.filter((c) => !known.has(c.slug));
  const pool = unknownTargets.length > 0 ? unknownTargets : node.connections;
  const target = pool.find((c) => c.surprising) ?? pool[0];

  return {
    anchor: { slug: node.slug, title: node.title },
    target,
    anchorIsKnown: known.has(node.slug),
  };
}
