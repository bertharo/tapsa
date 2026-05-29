export type Domain = "science" | "history";

export const SCHEMA_VERSION = 3;

export type Connection = {
  /** Canonical slug of the target node. Always sourced from a real Wikipedia link. */
  slug: string;
  title: string;
  /** One-line "why this connects". */
  rationale: string;
  /** Exactly one connection per node is marked surprising — the "what you missed" node. */
  surprising: boolean;
};

/** A drill-down target: a top-level section of the underlying article. */
export type SectionRef = {
  /** Section node slug, e.g. "albert-einstein~early-life-and-education". */
  slug: string;
  title: string;
};

export type TapsaNode = {
  slug: string;
  title: string;
  /** LLM-rewritten, grounded in the Wikipedia summary. The tight teaser. */
  summary: string;
  /**
   * Longer readable body for the reading view: the article's full lead/intro
   * (several paragraphs) for article nodes, or the section's body text for
   * section nodes. Plain text with paragraphs separated by "\n\n".
   */
  lead?: string;
  /** Wikipedia URL, shown for trust. */
  sourceUrl: string;
  domain: Domain;
  connections: Connection[];
  /**
   * Sections to "go deeper" into (Early life, Marriages, Scientific career…).
   * Present on article nodes; empty on section nodes (v1 doesn't nest further).
   */
  sections: SectionRef[];
  /** "article" = a Wikipedia page; "section" = a drilled-into part of one. */
  kind: "article" | "section";
  /** For section nodes: the parent article this section belongs to. */
  parentSlug?: string;
  parentTitle?: string;
  generatedAt: string;
  schemaVersion: number;
  /** How the connections were produced — useful for analytics + debugging. */
  origin: "llm" | "fallback";
};

/** A candidate link pulled from Wikipedia, fed to the LLM for selection. */
export type CandidateLink = {
  slug: string;
  title: string;
};

/** The grounding payload fetched from Wikipedia before generation. */
export type Grounding = {
  slug: string;
  title: string;
  summary: string;
  /** Full Wikipedia lead/intro (several paragraphs) for the reading view. */
  lead?: string;
  sourceUrl: string;
  candidates: CandidateLink[];
};
