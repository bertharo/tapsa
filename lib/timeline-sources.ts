import { fetchArticlePlainText, fetchSections, fetchSectionContent } from "./wikipedia";
import { restSummaryByTitle } from "./timeline-wiki";
import { titleToSlug } from "./slug";

export type ChronologicalSourceKind =
  | "history_article"
  | "timeline_article"
  | "history_section"
  | "main_article";

export type ChronologicalSource = {
  kind: ChronologicalSourceKind;
  articleTitle: string;
  text: string;
  sections: { name: string; index: string; text: string }[];
};

export type ResolvedChronology = {
  mainTitle: string;
  mainSlug: string;
  revisionId: number;
  sourceUrl: string;
  lead: string;
  sources: ChronologicalSource[];
  mergedText: string;
};

const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

function baseTopic(query: string): string {
  return query.replace(/^(the|a|an)\s+/i, "").replace(/^(history|timeline)\s+of\s+/i, "").trim();
}

async function articleExists(title: string): Promise<boolean> {
  const s = await restSummaryByTitle(title);
  return !!s && s.type !== "disambiguation";
}

async function fetchRevisionId(title: string): Promise<number> {
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
  return Object.values(data.query?.pages ?? {})[0]?.revisions?.[0]?.revid ?? 0;
}

function findHistorySection(sections: { line: string; index: string }[]): string | null {
  const hit = sections.find((s) => /^history\b/i.test(s.line.trim()));
  return hit?.index ?? null;
}

async function buildSource(
  kind: ChronologicalSourceKind,
  articleTitle: string,
): Promise<ChronologicalSource | null> {
  if (!(await articleExists(articleTitle))) return null;

  if (kind === "history_section") {
    const sections = await fetchSections(articleTitle);
    const historyIdx = findHistorySection(sections);
    if (!historyIdx) return null;
    const { text } = await fetchSectionContent(articleTitle, historyIdx);
    if (text.length < 120) return null;
    return {
      kind,
      articleTitle,
      text,
      sections: [{ name: "History", index: historyIdx, text }],
    };
  }

  const text = await fetchArticlePlainText(articleTitle, 24000);
  if (text.length < 120) return null;

  const wikiSections = await fetchSections(articleTitle);
  const sectionTexts: { name: string; index: string; text: string }[] = [];
  for (const sec of wikiSections.slice(0, 12)) {
    const { text: st } = await fetchSectionContent(articleTitle, sec.index);
    if (st.length > 80) sectionTexts.push({ name: sec.line, index: sec.index, text: st });
  }

  return { kind, articleTitle, text, sections: sectionTexts };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Hunt chronological sources in priority order; merge when primary is thin.
 */
export async function resolveChronologicalSources(
  mainTitle: string,
  userQuery: string,
): Promise<ResolvedChronology> {
  const base = baseTopic(userQuery) || baseTopic(mainTitle);
  const withThe = base.match(/^(the\s+)/i) ? base : `the ${base}`;
  const candidates: { kind: ChronologicalSourceKind; title: string }[] = [
    { kind: "history_article", title: `History of ${base}` },
    { kind: "history_article", title: `History of ${withThe}` },
    { kind: "timeline_article", title: `Timeline of ${base}` },
    { kind: "timeline_article", title: `Timeline of ${withThe}` },
    { kind: "history_section", title: mainTitle },
    { kind: "main_article", title: mainTitle },
  ];

  const sources: ChronologicalSource[] = [];
  const seenTitles = new Set<string>();
  for (const c of candidates) {
    if (seenTitles.has(c.title.toLowerCase())) continue;
    seenTitles.add(c.title.toLowerCase());
    const built = await buildSource(c.kind, c.title);
    if (built) {
      sources.push(built);
      if (countWords(built.text) >= 400 && c.kind !== "main_article") break;
    }
  }

  if (!sources.length) {
    const fallback = await buildSource("main_article", mainTitle);
    if (fallback) sources.push(fallback);
  }

  const summary = await restSummaryByTitle(mainTitle);
  const sourceUrl =
    summary?.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(mainTitle.replace(/\s+/g, "_"))}`;

  const mergedParts = sources.map((s) => `=== ${s.articleTitle} ===\n${s.text}`);
  const mergedText = mergedParts.join("\n\n").slice(0, 48000);

  return {
    mainTitle,
    mainSlug: titleToSlug(mainTitle),
    revisionId: await fetchRevisionId(mainTitle),
    sourceUrl,
    lead: summary?.extract?.trim() ?? "",
    sources,
    mergedText,
  };
}
