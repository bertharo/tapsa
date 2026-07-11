/** Shared Wikipedia REST helpers for timeline modules. */

import { timelineFetch } from "./timeline-fetch";

const WIKI_REST = "https://en.wikipedia.org/api/rest_v1";
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

type WikiSummary = {
  type: string;
  title: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

export async function restSummaryByTitle(titleQuery: string): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(titleQuery.replace(/\s+/g, "_"));
  const res = await timelineFetch(`${WIKI_REST}/page/summary/${encoded}?redirect=true`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as WikiSummary;
  if (data.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") return null;
  return data;
}
