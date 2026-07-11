import type { Connection, TapsaNode } from "./types";
import { SCHEMA_VERSION } from "./types";

/** Instant placeholder node from a connection we already have on screen. */
export function shellNodeFromConnection(conn: Connection): TapsaNode {
  const wikiTitle = conn.title.replace(/\s+/g, "_");
  return {
    slug: conn.slug,
    title: conn.title,
    summary: conn.rationale,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`,
    connections: [],
    sections: [],
    kind: "article",
    generatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    origin: "fallback",
  };
}

export function isShellNode(node: TapsaNode, hydratingSlug: string | null): boolean {
  return hydratingSlug === node.slug && node.connections.length === 0;
}
