import type { CandidateLink, Domain, Grounding } from "./types";
import { slugToTitleQuery, titleToSlug } from "./slug";

const WIKI_REST = "https://en.wikipedia.org/api/rest_v1";
const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const WIKIDATA_ACTION = "https://www.wikidata.org/w/api.php";

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

/** Fetch a summary by an exact title query. Returns null on 404/not-found. */
async function restSummaryByTitle(titleQuery: string): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(titleQuery.replace(/\s+/g, "_"));
  const res = await fetch(`${WIKI_REST}/page/summary/${encoded}?redirect=true`, {
    headers: HEADERS,
    // Grounding facts rarely change; let Next cache aggressively.
    next: { revalidate: 60 * 60 * 24 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia summary failed (${res.status}) for ${titleQuery}`);
  const data = (await res.json()) as WikiSummary;
  if (data.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") {
    return null;
  }
  return data;
}

/** Top OpenSearch hit for a free-text query — used to recover real titles. */
async function searchTopTitle(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  const params = new URLSearchParams({
    action: "opensearch",
    search: q,
    limit: "1",
    namespace: "0",
    format: "json",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    // OpenSearch returns [query, [titles], [descriptions], [urls]].
    const data = (await res.json()) as [string, string[], string[], string[]];
    return data[1]?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a slug to its Wikipedia summary, following redirects.
 *
 * Our slugs are lossy: titles with "+", parentheses, "&", accents, etc. can't
 * be reconstructed by slugToTitleQuery (e.g. "1ES 1927+654" -> "1es-1927654"),
 * so a direct title lookup 404s. We fall back to OpenSearch, which matches real
 * titles fuzzily, then fetch the recovered title. This keeps connection cards
 * navigable instead of dead-ending on the "trail went cold" page.
 */
async function fetchSummary(slug: string): Promise<WikiSummary> {
  const titleQuery = slugToTitleQuery(slug);

  const direct = await restSummaryByTitle(titleQuery);
  if (direct) return direct;

  const resolvedTitle = await searchTopTitle(titleQuery);
  if (resolvedTitle) {
    const viaSearch = await restSummaryByTitle(resolvedTitle);
    if (viaSearch) return viaSearch;
  }

  throw new TopicNotFoundError(slug);
}

/**
 * Full lead/intro section of an article as plain text (several paragraphs).
 * Powers the reading view; falls back to "" so the short summary still shows.
 */
async function fetchLeadExtract(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    titles: title,
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const pages = data.query?.pages ?? {};
    const extract = Object.values(pages)[0]?.extract ?? "";
    // Normalize whitespace but preserve paragraph breaks.
    return extract
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}

type ActionLinksResponse = {
  query?: {
    pages?: Record<
      string,
      { title?: string; links?: { ns: number; title: string }[] }
    >;
  };
  continue?: { plcontinue?: string };
};

/**
 * Outgoing article links (namespace 0) for a title via the Action API, paged so
 * we see the WHOLE link set — not just the alphabetical first slice. This is
 * what lets popularity ranking surface a famous link (e.g. Michael Jordan from
 * NBA) that would otherwise sit far down the alphabet.
 */
async function fetchOutgoingLinks(title: string, maxLinks = 1500): Promise<CandidateLink[]> {
  const links: CandidateLink[] = [];
  let plcontinue: string | undefined;
  for (let page = 0; page < 4 && links.length < maxLinks; page++) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "links",
      titles: title,
      plnamespace: "0",
      pllimit: "max",
      redirects: "1",
      origin: "*",
    });
    if (plcontinue) params.set("plcontinue", plcontinue);
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) break;
    const data = (await res.json()) as ActionLinksResponse;
    for (const p of Object.values(data.query?.pages ?? {})) {
      for (const link of p.links ?? []) {
        if (link.ns === 0) links.push({ slug: titleToSlug(link.title), title: link.title });
      }
    }
    plcontinue = data.continue?.plcontinue;
    if (!plcontinue) break;
  }
  return links;
}

/**
 * Re-order candidates by recent Wikipedia pageviews (popularity). Topics are
 * batched (50 titles/request) so this is a handful of parallel calls regardless
 * of pool size. Unknown/zero-view pages keep their relative order at the back.
 */
async function rankByPageviews(cands: CandidateLink[]): Promise<CandidateLink[]> {
  if (cands.length <= 1) return cands;
  const views = new Map<string, number>();
  const batches: CandidateLink[][] = [];
  for (let i = 0; i < cands.length; i += 50) batches.push(cands.slice(i, i + 50));

  await Promise.all(
    batches.map(async (batch) => {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        prop: "pageviews",
        pvipdays: "30",
        titles: batch.map((c) => c.title).join("|"),
        redirects: "1",
        origin: "*",
      });
      try {
        const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
          headers: HEADERS,
          next: { revalidate: 60 * 60 * 24 },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          query?: {
            pages?: Record<string, { title?: string; pageviews?: Record<string, number | null> }>;
          };
        };
        for (const p of Object.values(data.query?.pages ?? {})) {
          if (!p.title) continue;
          const total = Object.values(p.pageviews ?? {}).reduce<number>(
            (n, v) => n + (v ?? 0),
            0,
          );
          views.set(titleToSlug(p.title), total);
        }
      } catch {
        /* ignore a failed batch; those candidates just rank as 0 */
      }
    }),
  );

  return cands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const dv = (views.get(b.c.slug) ?? 0) - (views.get(a.c.slug) ?? 0);
      return dv !== 0 ? dv : a.i - b.i; // stable for ties / unknowns
    })
    .map((x) => x.c);
}

/**
 * Extract namespace-0 article links from rendered Wikipedia HTML, in document
 * order. The [^"#:] class skips anchors and namespaced (File:, Help:, Category:…)
 * links, which always contain a colon.
 */
function extractWikiLinks(html: string): CandidateLink[] {
  const out: CandidateLink[] = [];
  const seen = new Set<string>();
  const re = /<a href="\/wiki\/([^"#:]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const linkTitle = decodeURIComponent(m[1]).replace(/_/g, " ");
    const slug = titleToSlug(linkTitle);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: linkTitle });
  }
  return out;
}

/**
 * Links inside the article's intro/lead section. These are the editorially
 * chosen "most important" links (key people, places, sub-topics) and are far
 * higher quality than the full alphabetical link dump.
 */
async function fetchIntroLinks(title: string): Promise<CandidateLink[]> {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    prop: "text",
    section: "0",
    page: title,
    redirects: "1",
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { parse?: { text?: { "*"?: string } } };
    return extractWikiLinks(data.parse?.text?.["*"] ?? "");
  } catch {
    return [];
  }
}

type SearchResponse = { query?: { search?: { title: string }[] } };

/**
 * Relevance-ranked "more like this" articles via CirrusSearch. This is the most
 * reliable source of semantically related topics (the REST related endpoint is
 * frequently empty), so it anchors the candidate pool with meaningful links.
 */
async function fetchMoreLike(title: string): Promise<CandidateLink[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srsearch: `morelike:${title}`,
    srlimit: "20",
    srnamespace: "0",
    srprop: "",
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SearchResponse;
    return (data.query?.search ?? []).map((s) => ({
      slug: titleToSlug(s.title),
      title: s.title,
    }));
  } catch {
    return [];
  }
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
  // Year-prefixed event stubs (e.g. "1947 BAA Finals", "1949–50 NBA season",
  // "2025–26 NBA season", "1950 NBA draft"). These dominate alphabetical link
  // dumps for sports/recurring topics and crowd out meaningful connections.
  if (
    /^\d{3,4}(?:[–-]\d{2,4})?\b.*\b(season|seasons|finals|draft|playoffs?|games|olympics|championships?|tournament|cup|series|election|grand prix)\b/.test(
      t,
    )
  ) {
    return true;
  }
  // Bare years / decades ("1947", "1990s").
  if (/^\d{3,4}(?:s)?$/.test(t)) return true;
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

  const [intro, morelike, related, outgoing, lead] = await Promise.all([
    fetchIntroLinks(canonicalTitle),
    fetchMoreLike(canonicalTitle),
    fetchRelated(canonicalTitle),
    fetchOutgoingLinks(canonicalTitle),
    fetchLeadExtract(canonicalTitle),
  ]);

  // The broad outgoing set is cleaned, then re-ordered by popularity so famous
  // linked topics (Michael Jordan from NBA) rise above niche stubs.
  const cleanedOutgoing = dedupeAndClean(outgoing, canonicalSlug).slice(0, 400);
  const popularOutgoing = await rankByPageviews(cleanedOutgoing);

  // Quality order: the article's own intro links (editorially important) and
  // relevance-ranked "more like this" first, then the REST related set, then
  // the popularity-ranked outgoing links. This keeps the pool full of
  // meaningful, expected connections instead of date-prefixed event stubs.
  const candidates = dedupeAndClean(
    [...intro, ...morelike, ...related, ...popularOutgoing],
    canonicalSlug,
  ).slice(0, 60);

  const sourceUrl =
    summary.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(
      canonicalTitle.replace(/\s+/g, "_"),
    )}`;

  return {
    slug: canonicalSlug,
    title: canonicalTitle,
    summary: summary.extract,
    // Prefer the fuller lead; fall back to the short extract for the reading view.
    lead: lead || summary.extract,
    sourceUrl,
    candidates,
  };
}

/** Lightweight grounding for timelines — summary + lead only, no candidate pool. */
export async function fetchTimelineGrounding(slug: string): Promise<{
  slug: string;
  title: string;
  summary: string;
  lead: string;
  sourceUrl: string;
}> {
  const summary = await fetchSummary(slug);
  const canonicalTitle = summary.title;
  const canonicalSlug = titleToSlug(canonicalTitle);
  const lead = await fetchLeadExtract(canonicalTitle);
  const sourceUrl =
    summary.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle.replace(/\s+/g, "_"))}`;

  return {
    slug: canonicalSlug,
    title: canonicalTitle,
    summary: summary.extract,
    lead: lead || summary.extract,
    sourceUrl,
  };
}

/** Full article plain-text extract for timeline event extraction (not just intro). */
export async function fetchArticlePlainText(title: string, maxChars = 16000): Promise<string> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    titles: title,
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const extract = Object.values(data.query?.pages ?? {})[0]?.extract ?? "";
    return extract
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxChars);
  } catch {
    return "";
  }
}

/** Lead image for a Wikipedia page — thumbnail preferred, original as fallback. */
export async function fetchWikiLeadImage(wikiTitle: string): Promise<string | null> {
  const encoded = encodeURIComponent(wikiTitle.replace(/\s+/g, "_"));
  try {
    const res = await fetch(`${WIKI_REST}/page/summary/${encoded}?redirect=true`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

export type WikiSection = {
  index: string;
  line: string;
  anchor: string;
  /** Hierarchical TOC number, e.g. "1", "1.2" — encodes parent/child/sibling. */
  number: string;
  toclevel: number;
};

const SECTION_BOILERPLATE = new Set(
  [
    "references",
    "notes",
    "citations",
    "footnotes",
    "sources",
    "external links",
    "further reading",
    "bibliography",
    "see also",
    "works cited",
    "explanatory notes",
  ].map((s) => s.toLowerCase()),
);

/** All sections of an article (with hierarchy), minus reference boilerplate. */
export async function fetchSections(title: string): Promise<WikiSection[]> {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    prop: "sections",
    page: title,
    redirects: "1",
    origin: "*",
  });
  const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    parse?: {
      sections?: {
        toclevel: number;
        line: string;
        index: string;
        anchor: string;
        number: string;
      }[];
    };
  };
  const sections = data.parse?.sections ?? [];
  return sections
    .filter((s) => /^\d+$/.test(s.index)) // numeric index = fetchable content
    .map((s) => ({
      index: s.index,
      line: stripHtml(s.line),
      anchor: s.anchor,
      number: s.number,
      toclevel: s.toclevel,
    }))
    .filter((s) => s.line && !SECTION_BOILERPLATE.has(s.line.toLowerCase()));
}

/**
 * A single section's body text AND the topical links inside it. The links are
 * what let a drilled-into section generate NEW connections to other articles
 * (e.g. Einstein's "Scientific career" → Brownian motion, special relativity).
 */
export async function fetchSectionContent(
  title: string,
  index: string,
): Promise<{ text: string; links: CandidateLink[] }> {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    prop: "text",
    page: title,
    section: index,
    redirects: "1",
    disabletoc: "1",
    origin: "*",
  });
  const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) return { text: "", links: [] };
  const data = (await res.json()) as { parse?: { text?: { "*"?: string } } };
  const html = data.parse?.text?.["*"] ?? "";
  return {
    // Generous cap: this text feeds both the LLM rewrite and the reading view.
    text: stripHtml(html).slice(0, 4000),
    links: extractWikiLinks(html),
  };
}

/**
 * Turn a raw set of links into a ranked candidate pool: drop noise, cap, and
 * re-order by popularity. Shared by section-node generation so drilled-in
 * sections get the same high-quality connection pool as article nodes.
 */
export async function rankCandidates(
  links: CandidateLink[],
  selfSlug: string,
): Promise<CandidateLink[]> {
  const cleaned = dedupeAndClean(links, selfSlug).slice(0, 300);
  const ranked = await rankByPageviews(cleaned);
  return ranked.slice(0, 60);
}

/** Crude but effective HTML → text for section bodies. */
function stripHtml(html: string): string {
  return html
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "") // citation markers
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<table[^>]*>[\s\S]*?<\/table>/gi, "") // infoboxes
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/\[edit\]/gi, "")
    .replace(/\[\d+\]/g, "") // leftover ref numbers
    .replace(/\s+/g, " ")
    .trim();
}

/** Wikidata QID for an article, via pageprops. Null when the page has none. */
async function fetchWikidataId(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "pageprops",
    ppprop: "wikibase_item",
    titles: title,
    redirects: "1",
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> };
    };
    const pages = data.query?.pages ?? {};
    return Object.values(pages)[0]?.pageprops?.wikibase_item ?? null;
  } catch {
    return null;
  }
}

/** English labels of an entity's "instance of" (P31) targets. */
async function fetchInstanceOfLabels(qid: string): Promise<string[]> {
  const claimsParams = new URLSearchParams({
    action: "wbgetclaims",
    entity: qid,
    property: "P31",
    format: "json",
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKIDATA_ACTION}?${claimsParams.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      claims?: { P31?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[] };
    };
    const targetIds = (data.claims?.P31 ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter((x): x is string => !!x);
    if (targetIds.length === 0) return [];

    const labelParams = new URLSearchParams({
      action: "wbgetentities",
      ids: targetIds.slice(0, 12).join("|"),
      props: "labels",
      languages: "en",
      format: "json",
      origin: "*",
    });
    const lres = await fetch(`${WIKIDATA_ACTION}?${labelParams.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!lres.ok) return [];
    const ldata = (await lres.json()) as {
      entities?: Record<string, { labels?: { en?: { value?: string } } }>;
    };
    return Object.values(ldata.entities ?? {})
      .map((e) => e.labels?.en?.value)
      .filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

const DOMAIN_RULES: { domain: Domain; pattern: RegExp }[] = [
  {
    domain: "science",
    pattern:
      /\b(?:astronom\w*|celestial|planet\w*|moons?|stars?|galax\w*|nebula\w*|comets?|asteroids?|chemical\w*|compounds?|elements?|minerals?|molecul\w*|particles?|subatomic|physical quantity|unit of measurement|scientific|theorems?|mathematic\w*|equations?|taxon\w*|species|organis\w*|bacteri\w*|virus\w*|proteins?|enzymes?|diseases?|disorders?|syndromes?|anatomical|biolog\w*|physic\w*|chemistr\w*|metabolic|natural phenomenon)\b/,
  },
  {
    domain: "history",
    pattern:
      /\b(?:historical|history|ancient|former (?:country|kingdom|monarchy|state|empire)|empires?|dynast\w*|kingdoms?|civili[sz]ation\w*|wars?|battles?|military conflict|sieges?|treat(?:y|ies)|revolutions?|monarch\w*|archaeolog\w*|eras?|epochs?|prehistor\w*|colonial)\b/,
  },
];

/**
 * Grounded topic classification from Wikidata "instance of" (P31). Returns a
 * domain ONLY when the entity's types map cleanly and unambiguously to exactly
 * one; otherwise undefined, so the UI omits the label rather than guessing.
 * e.g. "World Cup" → P31 "recurring sporting event" maps to neither → undefined
 * (must never read SCIENCE).
 */
export async function classifyDomain(title: string): Promise<Domain | undefined> {
  const qid = await fetchWikidataId(title);
  if (!qid) return undefined;
  const labels = await fetchInstanceOfLabels(qid);
  if (labels.length === 0) return undefined;

  const blob = labels.join(" • ").toLowerCase();
  const matched = Array.from(
    new Set(DOMAIN_RULES.filter((r) => r.pattern.test(blob)).map((r) => r.domain)),
  );
  // Exactly one domain matched → confident. Zero or both (ambiguous) → omit.
  return matched.length === 1 ? matched[0] : undefined;
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
