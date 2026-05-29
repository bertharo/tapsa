export type Domain = "science" | "history";

export const SCHEMA_VERSION = 1;

export type Connection = {
  /** Canonical slug of the target node. Always sourced from a real Wikipedia link. */
  slug: string;
  title: string;
  /** One-line "why this connects". */
  rationale: string;
  /** Exactly one connection per node is marked surprising — the "what you missed" node. */
  surprising: boolean;
};

export type TapsaNode = {
  slug: string;
  title: string;
  /** LLM-rewritten, grounded in the Wikipedia summary. */
  summary: string;
  /** Wikipedia URL, shown for trust. */
  sourceUrl: string;
  domain: Domain;
  connections: Connection[];
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
  sourceUrl: string;
  candidates: CandidateLink[];
};
