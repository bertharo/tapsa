import { titleToSlug } from "./slug";
import { TopicNotFoundError } from "./timeline-errors";

const WIKI_REST = "https://en.wikipedia.org/api/rest_v1";
const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

export const THIN_ARTICLE_WORD_LIMIT = 800;

export type ResolvedTimelineArticle = {
  title: string;
  slug: string;
  revisionId: number;
  sourceUrl: string;
  wordCount: number;
  /** Primary article plain text. */
  text: string;
  /** Extra articles merged in during widening (titles only). */
  supplements: string[];
  /** Article title used as the extraction anchor (may differ when widening). */
  extractionTitle: string;
};

type WikiSummary = {
  type: string;
  title: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function restSummaryByTitle(titleQuery: string): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(titleQuery.replace(/\s+/g, "_"));
  const res = await fetch(`${WIKI_REST}/page/summary/${encoded}?redirect=true`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as WikiSummary;
  if (data.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") return null;
  return data;
}

async function searchTitles(query: string, limit = 8): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: q,
    srlimit: String(limit),
    format: "json",
    origin: "*",
  });
  try {
    const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { search?: { title: string }[] };
    };
    return (data.query?.search ?? []).map((h) => h.title);
  } catch {
    return [];
  }
}

async function isDisambiguation(title: string): Promise<boolean> {
  const summary = await restSummaryByTitle(title);
  return summary?.type === "disambiguation";
}

function scoreTitle(title: string, preferHistory: boolean, preferTimeline: boolean): number {
  if (preferHistory && /history/i.test(title)) return 0;
  if (preferTimeline && /timeline/i.test(title)) return 0;
  return 1;
}

export type DisambiguationOption = { title: string; slug: string };

/**
 * When the user's query lands on a Wikipedia disambiguation page, return
 * concrete article choices instead of silently picking the next search hit.
 */
export async function getDisambiguationOptions(query: string): Promise<DisambiguationOption[] | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const direct = await restSummaryByTitle(trimmed);
  const directIsDisambig = direct?.type === "disambiguation";

  if (!directIsDisambig) {
    const hits = await searchTitles(trimmed, 10);
    const first = hits[0];
    if (!first || !(await isDisambiguation(first))) return null;
    const firstNorm = first.toLowerCase().replace(/\s+/g, " ");
    const qNorm = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (firstNorm !== qNorm) return null;
  }

  const hits = await searchTitles(trimmed, 12);
  const options: DisambiguationOption[] = [];
  for (const title of hits) {
    if (await isDisambiguation(title)) continue;
    options.push({ title, slug: titleToSlug(title) });
    if (options.length >= 8) break;
  }
  return options.length >= 2 ? options : null;
}

/** Pick the first search hit that is not a disambiguation page. */
export async function resolveArticleTitle(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) throw new TopicNotFoundError("");

  // Direct title lookup first (handles exact Wikipedia titles).
  const direct = await restSummaryByTitle(trimmed);
  if (direct && direct.type !== "disambiguation") return direct.title;

  const hits = await searchTitles(trimmed);
  const preferHistory = /^history\s+of\s+/i.test(trimmed);
  const preferTimeline = /^timeline\s+of\s+/i.test(trimmed);
  const ordered =
    preferHistory || preferTimeline
      ? [...hits].sort((a, b) => scoreTitle(a, preferHistory, preferTimeline) - scoreTitle(b, preferHistory, preferTimeline))
      : hits;

  for (const title of ordered) {
    if (!(await isDisambiguation(title))) return title;
  }

  throw new TopicNotFoundError(titleToSlug(trimmed));
}

export async function fetchRevisionId(title: string): Promise<number> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "revisions",
    rvprop: "ids",
    titles: title,
    redirects: "1",
    origin: "*",
  });
  const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 },
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { revisions?: { revid?: number }[] }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.revisions?.[0]?.revid ?? 0;
}

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

export function timelineCacheKey(title: string, revisionId: number): string {
  const safe = title.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
  return `${safe}_r${revisionId}`;
}

async function findSupplementTitles(userQuery: string, primaryTitle: string): Promise<string[]> {
  const base = userQuery.replace(/^(history|timeline)\s+of\s+/i, "").trim() || userQuery.trim();
  const patterns = new Set<string>([
    userQuery.trim(),
    `History of ${base}`,
    `Timeline of ${base}`,
  ]);
  if (base.length > 2 && base !== userQuery.trim()) {
    patterns.add(base);
  }
  const found: string[] = [];
  for (const pattern of patterns) {
    if (!pattern) continue;
    const summary = await restSummaryByTitle(pattern);
    if (
      summary &&
      summary.type !== "disambiguation" &&
      summary.title !== primaryTitle &&
      !found.includes(summary.title)
    ) {
      found.push(summary.title);
    }
  }
  return found;
}

function mergeArticleTexts(primaryTitle: string, primary: string, supplements: { title: string; text: string }[]): string {
  const parts = [`=== ${primaryTitle} ===\n${primary}`];
  for (const s of supplements) {
    parts.push(`\n\n=== ${s.title} (supplement) ===\n${s.text}`);
  }
  return parts.join("").slice(0, 24000);
}

/**
 * Resolve a user query to a Wikipedia article, optionally widening once with
 * History/Timeline companion articles when the primary text is thin.
 */
export async function resolveTimelineArticle(
  query: string,
  options?: { widen?: boolean },
): Promise<ResolvedTimelineArticle> {
  const title = await resolveArticleTitle(query);
  const revisionId = await fetchRevisionId(title);
  const summary = await restSummaryByTitle(title);
  const sourceUrl =
    summary?.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;

  let primaryText = await fetchArticlePlainText(title);
  const supplements: string[] = [];
  let mergedText = primaryText;
  let extractionTitle = title;

  if (options?.widen) {
    const supplementTitles = await findSupplementTitles(query, title);
    const supplementTexts: { title: string; text: string }[] = [];
    for (const st of supplementTitles) {
      const text = await fetchArticlePlainText(st);
      if (text.length > 200) {
        supplements.push(st);
        supplementTexts.push({ title: st, text });
      }
    }
    if (supplementTexts.length > 0) {
      const richest =
        supplementTexts.reduce((a, b) => (a.text.length > b.text.length ? a : b));
      if (richest.text.length > primaryText.length * 1.5) {
        extractionTitle = richest.title;
        mergedText = richest.text;
      } else {
        mergedText = mergeArticleTexts(title, primaryText, supplementTexts);
      }
    }
  }

  return {
    title,
    slug: titleToSlug(title),
    revisionId,
    sourceUrl,
    wordCount: countWords(mergedText),
    text: mergedText,
    supplements,
    extractionTitle,
  };
}
