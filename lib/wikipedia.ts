import type { CandidateLink, Grounding } from "./types";
import { slugToTitleQuery, titleToSlug } from "./slug";

const WIKI_REST = "https://en.wikipedia.org/api/rest_v1";
const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";

// Wikimedia asks all clients to send a descriptive User-Agent.
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai)";

const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

export class TopicNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Topic not found: ${slug}`);
    this.name = "TopicNotFoundError";
  }
}

type WikiSummary = {
  type: string;
  title: string;
  extract: string;
  content_urls?: { desktop?: { page?: string } };
  originalimage?: { source?: string };
};

/** Resolve a slug to its Wikipedia summary, following redirects. */
async function fetchSummary(slug: string): Promise<WikiSummary> {
  const titleQuery = slugToTitleQuery(slug);
  const encoded = encodeURIComponent(titleQuery.replace(/\s+/g, "_"));
  const res = await fetch(`${WIKI_REST}/page/summary/${encoded}?redirect=true`, {
    headers: HEADERS,
    // Grounding facts rarely change; let Next cache aggressively.
    next: { revalidate: 60 * 60 * 24 },
  });

  if (res.status === 404) throw new TopicNotFoundError(slug);
  if (!res.ok) throw new Error(`Wikipedia summary failed (${res.status}) for ${slug}`);

  const data = (await res.json()) as WikiSummary;
  if (data.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") {
    throw new TopicNotFoundError(slug);
  }
  return data;
}

type ActionLinksResponse = {
  query?: {
    pages?: Record<
      string,
      { title?: string; links?: { ns: number; title: string }[] }
    >;
  };
};

/** Outgoing article links (namespace 0) for a title via the Action API. */
async function fetchOutgoingLinks(title: string): Promise<CandidateLink[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "links",
    titles: title,
    plnamespace: "0",
    pllimit: "200",
    redirects: "1",
    origin: "*",
  });
  const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as ActionLinksResponse;
  const pages = data.query?.pages ?? {};
  const links: CandidateLink[] = [];
  for (const page of Object.values(pages)) {
    for (const link of page.links ?? []) {
      if (link.ns !== 0) continue;
      links.push({ slug: titleToSlug(link.title), title: link.title });
    }
  }
  return links;
}

type RestRelatedResponse = {
  pages?: { title: string; titles?: { normalized?: string } }[];
};

/** Wikimedia "related pages" — semantically close topics. May be unavailable. */
async function fetchRelated(title: string): Promise<CandidateLink[]> {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  try {
    const res = await fetch(`${WIKI_REST}/page/related/${encoded}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as RestRelatedResponse;
    return (data.pages ?? []).map((p) => {
      const t = p.titles?.normalized ?? p.title;
      return { slug: titleToSlug(t), title: t };
    });
  } catch {
    return [];
  }
}

const STOP_TITLES = new Set(
  [
    "Wikipedia",
    "Main Page",
    "ISBN",
    "Doi (identifier)",
    "PMID (identifier)",
    "Bibcode (identifier)",
    "ISSN (identifier)",
    "Geographic coordinate system",
  ].map((t) => t.toLowerCase()),
);

function isNoise(c: CandidateLink): boolean {
  const t = c.title.toLowerCase();
  if (STOP_TITLES.has(t)) return true;
  // Identifier/list/disambiguation cruft that pollutes the link graph.
  if (/\(identifier\)$/.test(t)) return true;
  if (/^list of /.test(t)) return true;
  if (/\bdisambiguation\b/.test(t)) return true;
  if (/^(category|template|help|portal|file|wikipedia):/i.test(c.title)) return true;
  return false;
}

function dedupeAndClean(
  candidates: CandidateLink[],
  selfSlug: string,
): CandidateLink[] {
  const seen = new Set<string>([selfSlug]);
  const out: CandidateLink[] = [];
  for (const c of candidates) {
    if (!c.slug || seen.has(c.slug)) continue;
    if (isNoise(c)) continue;
    seen.add(c.slug);
    out.push(c);
  }
  return out;
}

/**
 * Fetch everything the generation layer needs: a canonical title, a factual
 * summary, the source URL, and a cleaned list of real candidate links.
 *
 * Related pages are prioritized (semantically meaningful) and topped up with
 * outgoing links so there's always a rich candidate pool to rank from.
 */
export async function fetchGrounding(slug: string): Promise<Grounding> {
  const summary = await fetchSummary(slug);
  const canonicalTitle = summary.title;
  const canonicalSlug = titleToSlug(canonicalTitle);

  const [related, outgoing] = await Promise.all([
    fetchRelated(canonicalTitle),
    fetchOutgoingLinks(canonicalTitle),
  ]);

  // Related first (higher quality), then outgoing to fill the pool.
  const candidates = dedupeAndClean([...related, ...outgoing], canonicalSlug).slice(
    0,
    60,
  );

  const sourceUrl =
    summary.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(
      canonicalTitle.replace(/\s+/g, "_"),
    )}`;

  return {
    slug: canonicalSlug,
    title: canonicalTitle,
    summary: summary.extract,
    sourceUrl,
    candidates,
  };
}

export type AutocompleteResult = { slug: string; title: string };

/** OpenSearch-backed autocomplete against real Wikipedia titles. */
export async function autocomplete(query: string): Promise<AutocompleteResult[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    action: "opensearch",
    search: q,
    limit: "8",
    namespace: "0",
    format: "json",
  });
  const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 5 },
  });
  if (!res.ok) return [];
  // OpenSearch returns [query, [titles], [descriptions], [urls]].
  const data = (await res.json()) as [string, string[], string[], string[]];
  const titles = data[1] ?? [];
  return titles.map((t) => ({ slug: titleToSlug(t), title: t }));
}
