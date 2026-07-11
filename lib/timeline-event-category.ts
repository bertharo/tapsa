import type { EventCategory, TimelineEvent } from "./timeline-types";
import { timelineFetch } from "./timeline-fetch";

const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

const SKIP_CATEGORY = /^(category|template|wikipedia|articles|pages|commons|wikidata|all pages)/i;

const RULES: { category: EventCategory; patterns: RegExp[] }[] = [
  {
    category: "MILITARY",
    patterns: [
      /\bmilitary\b/,
      /\bwar\b/,
      /\bbattle\b/,
      /\bconflict\b/,
      /\barmed forces\b/,
      /\bnavy\b/,
      /\barmy\b/,
      /\bair force\b/,
      /\binsurgent\b/,
    ],
  },
  {
    category: "POLITICS",
    patterns: [
      /\bpolitic/,
      /\bgovernment\b/,
      /\belection\b/,
      /\bparliament\b/,
      /\bdiplomac/,
      /\btreaty\b/,
      /\bhead of state\b/,
      /\bmonarch/,
    ],
  },
  {
    category: "SCIENCE",
    patterns: [
      /\bscience\b/,
      /\bscientist/,
      /\bresearch\b/,
      /\bdiscover/,
      /\bexperiment/,
      /\bphysic/,
      /\bbiology\b/,
      /\bchemistry\b/,
      /\bmedicine\b/,
      /\btechnology\b/,
    ],
  },
  {
    category: "ECONOMY",
    patterns: [
      /\beconom/,
      /\btrade\b/,
      /\bindustr/,
      /\bfinance\b/,
      /\bbusiness\b/,
      /\bmarket\b/,
      /\bcurrency\b/,
    ],
  },
  {
    category: "SOCIETY",
    patterns: [
      /\bsociet/,
      /\bsocial\b/,
      /\bhuman rights\b/,
      /\bdemograph/,
      /\beducation\b/,
      /\breligion\b/,
      /\blabor\b/,
      /\bprotest\b/,
    ],
  },
  {
    category: "CULTURE",
    patterns: [
      /\bculture\b/,
      /\bart\b/,
      /\bmusic\b/,
      /\bliterature\b/,
      /\bfilm\b/,
      /\barchitect/,
      /\bheritage\b/,
    ],
  },
];

async function fetchCategoriesBatch(titles: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!titles.length) return out;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "categories",
    cllimit: "max",
    titles: titles.join("|"),
    redirects: "1",
    origin: "*",
  });

  try {
    const res = await timelineFetch(`${WIKI_ACTION}?${params.toString()}`, {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return out;
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; categories?: { title: string }[] }
        >;
      };
    };
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (!page.title) continue;
      const cats = (page.categories ?? [])
        .map((c) => c.title.replace(/^Category:/i, "").trim())
        .filter((c) => c && !SKIP_CATEGORY.test(c));
      out.set(page.title.toLowerCase(), cats);
    }
  } catch {
    /* omit categories on failure */
  }

  return out;
}

export function categoryFromWikiCategories(categories: string[]): EventCategory | undefined {
  if (!categories.length) return undefined;

  const joined = categories.join(" ").toLowerCase();
  let best: { category: EventCategory; score: number } | null = null;

  for (const rule of RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(joined)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { category: rule.category, score };
    }
  }

  return best && best.score >= 1 ? best.category : undefined;
}

/** Derive event categories from each event article's Wikipedia categories. */
export async function attachEventCategories(events: TimelineEvent[]): Promise<TimelineEvent[]> {
  const titleByKey = new Map<string, string>();
  for (const ev of events) {
    const title = ev.wikiTitle.replace(/_/g, " ");
    titleByKey.set(title.toLowerCase(), title);
  }
  const uniqueTitles = [...titleByKey.values()];
  const categoryByTitle = new Map<string, EventCategory | undefined>();

  for (let i = 0; i < uniqueTitles.length; i += 20) {
    const batch = uniqueTitles.slice(i, i + 20);
    const batchCategories = await fetchCategoriesBatch(batch);
    for (const title of batch) {
      const cats = batchCategories.get(title.toLowerCase()) ?? [];
      categoryByTitle.set(title.toLowerCase(), categoryFromWikiCategories(cats));
    }
  }

  return events.map((ev) => {
    const titleKey = ev.wikiTitle.replace(/_/g, " ").toLowerCase();
    const category = categoryByTitle.get(titleKey);
    if (!category) {
      const { category: _removed, ...rest } = ev;
      return rest;
    }
    return { ...ev, category };
  });
}
