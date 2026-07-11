import type { Connection, Domain, Grounding, SectionRef, TapsaNode } from "./types";
import { SCHEMA_VERSION } from "./types";
import { getStore } from "./cache";
import {
  classifyDomain,
  fetchGrounding,
  fetchSectionContent,
  fetchSections,
  rankCandidates,
  TopicNotFoundError,
} from "./wikipedia";
import { generateNode } from "./llm";
import { recordNodeEvent } from "./metrics";
import { makeSectionSlug, parseSectionSlug, titleToSlug } from "./slug";

export { TopicNotFoundError };

const MAX_SECTIONS = 8;

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

  // Classify the topic (grounded in Wikidata P31) in parallel with generation,
  // so the grounded category adds no latency. A curated hint always wins.
  const [node, domain] = await Promise.all([
    generateNode(grounding, hintedDomain),
    hintedDomain
      ? Promise.resolve<Domain | undefined>(hintedDomain)
      : classifyDomain(grounding.title),
  ]);
  node.domain = domain;

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
 * Build a section node: a drilled-into part of an article. Like an article
 * node, it gets NEW topical connections — drawn from the links inside that
 * section and selected by the LLM — so drilling deeper keeps the map branching.
 * Child subsections become "go deeper" targets and a zoom-out link returns to
 * the parent section / full article. The summary is an LLM rewrite of the
 * section text.
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

  const canonicalParentSlug = parent.slug;
  const selfSlug = makeSectionSlug(canonicalParentSlug, match.line);
  const sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
    parent.title.replace(/\s+/g, "_"),
  )}#${match.anchor}`;

  // The section's body text + the topical links inside it (the new connections).
  const { text, links } = await fetchSectionContent(parent.title, match.index);
  const candidates = await rankCandidates(links, selfSlug);

  // One LLM pass rewrites the section into Tapsa's voice AND selects topical
  // connections from the section's own links — same engine as article nodes.
  const grounding: Grounding = {
    slug: selfSlug,
    title: `${match.line} (${parent.title})`,
    summary: text ? text.slice(0, 1800) : `This section covers part of ${parent.title}.`,
    lead: text,
    sourceUrl,
    candidates,
  };
  // Classify from the parent (grounded), in parallel with generation. Section
  // nodes display the parent title, not the domain, but we keep it consistent.
  const [generated, domain] = await Promise.all([
    generateNode(grounding, hintedDomain),
    hintedDomain
      ? Promise.resolve<Domain | undefined>(hintedDomain)
      : classifyDomain(parent.title),
  ]);

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

  // Zoom back out: to the immediate parent section, or the whole article.
  const parentSection = parentNumber
    ? sections.find((s) => s.number === parentNumber)
    : undefined;
  const zoomOut: Connection = parentSection
    ? {
        slug: makeSectionSlug(canonicalParentSlug, parentSection.line),
        title: parentSection.line,
        rationale: `Back up to ${parentSection.line}.`,
        surprising: false,
      }
    : {
        slug: canonicalParentSlug,
        title: parent.title,
        rationale: `Zoom back out to all of ${parent.title}.`,
        surprising: false,
      };

  // Topical connections first; if the section had no usable links, fall back to
  // sibling-section navigation so the node is never a dead end. Always offer the
  // zoom-out so the user can climb back up the article.
  let connections = [...generated.connections];
  if (connections.length === 0) {
    connections = sections
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
  }
  connections = [...connections, zoomOut];

  const node: TapsaNode = {
    slug: selfSlug,
    title: match.line,
    summary: generated.summary,
    // The section's own body text is the "longer read" for section nodes.
    lead: text || generated.summary,
    sourceUrl,
    domain,
    connections,
    sections: childSections,
    kind: "section",
    parentSlug: canonicalParentSlug,
    parentTitle: parent.title,
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    origin: generated.origin,
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
