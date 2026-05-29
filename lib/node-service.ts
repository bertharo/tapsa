import type { Connection, Domain, SectionRef, TapsaNode } from "./types";
import { SCHEMA_VERSION } from "./types";
import { getStore } from "./cache";
import {
  fetchGrounding,
  fetchSectionExtract,
  fetchSections,
  TopicNotFoundError,
} from "./wikipedia";
import { generateNode, summarizeSection } from "./llm";
import { recordNodeEvent } from "./metrics";
import { makeSectionSlug, parseSectionSlug, titleToSlug } from "./slug";

export { TopicNotFoundError };

const MAX_SECTIONS = 8;

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

  // Section slugs ("parent~section") drill into an article's own structure.
  const section = parseSectionSlug(slug);
  if (section) {
    return createSectionNode(section.parentSlug, section.sectionSlug, hintedDomain);
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

  // Attach top-level drill-down sections so users can "go deeper".
  try {
    const sections = await fetchSections(grounding.title);
    node.sections = sections
      .filter((s) => s.toclevel === 1)
      .slice(0, MAX_SECTIONS)
      .map(
        (s): SectionRef => ({
          slug: makeSectionSlug(node.slug, s.line),
          title: s.line,
        }),
      );
  } catch (err) {
    console.error("[tapsa] section listing failed:", err);
    node.sections = [];
  }

  await store.set(node);

  recordNodeEvent({
    kind: "cold_generation",
    slug: node.slug,
    origin: node.origin,
    ms: Date.now() - startedAt,
  });

  return { node, cacheHit: false };
}

/**
 * Build a section node: a drilled-into part of an article. Its connections are
 * the sibling sections (move laterally through the article) plus a link back to
 * the full overview. The summary is an LLM rewrite of just that section.
 */
async function createSectionNode(
  parentSlug: string,
  sectionSlug: string,
  hintedDomain?: Domain,
): Promise<NodeResult> {
  const startedAt = Date.now();

  // Resolve the parent's canonical title (cheap grounding fetch, well-cached).
  const parent = await fetchGrounding(parentSlug);
  const sections = await fetchSections(parent.title);
  const match = sections.find((s) => titleToSlug(s.line) === sectionSlug);
  if (!match) {
    throw new TopicNotFoundError(`${parentSlug}~${sectionSlug}`);
  }

  const text = await fetchSectionExtract(parent.title, match.index);
  const { summary, origin } = await summarizeSection(parent.title, match.line, text);
  const domain = hintedDomain ?? inferDomain(`${parent.title} ${parent.summary}`);

  const canonicalParentSlug = parent.slug;
  const selfSlug = makeSectionSlug(canonicalParentSlug, match.line);
  const depth = match.number.split(".").length;
  const parentNumber = depth > 1 ? match.number.split(".").slice(0, -1).join(".") : null;

  // Direct child subsections → the "go deeper" options on this section node.
  const children = sections.filter(
    (s) => s.number.startsWith(`${match.number}.`) && s.number.split(".").length === depth + 1,
  );
  const childSections: SectionRef[] = children.slice(0, MAX_SECTIONS).map((s) => ({
    slug: makeSectionSlug(canonicalParentSlug, s.line),
    title: s.line,
  }));

  // Same-level siblings under the same parent → lateral connections.
  const siblingConnections: Connection[] = sections
    .filter((s) => {
      if (s.index === match.index) return false;
      if (s.number.split(".").length !== depth) return false;
      const sParent =
        s.number.split(".").length > 1 ? s.number.split(".").slice(0, -1).join(".") : null;
      return sParent === parentNumber;
    })
    .slice(0, 5)
    .map((s) => ({
      slug: makeSectionSlug(canonicalParentSlug, s.line),
      title: s.line,
      rationale: `Another part of ${parent.title}.`,
      surprising: false,
    }));

  // Zoom back out: to the immediate parent section, or the whole article.
  const parentSection = parentNumber
    ? sections.find((s) => s.number === parentNumber)
    : undefined;
  const parentConnection: Connection = parentSection
    ? {
        slug: makeSectionSlug(canonicalParentSlug, parentSection.line),
        title: parentSection.line,
        rationale: `Back up to ${parentSection.line}.`,
        surprising: true,
      }
    : {
        slug: canonicalParentSlug,
        title: parent.title,
        rationale: `Zoom back out to all of ${parent.title}.`,
        surprising: true,
      };

  const node: TapsaNode = {
    slug: selfSlug,
    title: match.line,
    summary,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(
      parent.title.replace(/\s+/g, "_"),
    )}#${match.anchor}`,
    domain,
    connections: [parentConnection, ...siblingConnections],
    sections: childSections,
    kind: "section",
    parentSlug: canonicalParentSlug,
    parentTitle: parent.title,
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    origin,
  };

  await getStore().set(node);
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
