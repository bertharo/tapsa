/** Wikidata helpers shared by topic classification — leaf module to avoid circular imports. */

const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const WIKIDATA_ACTION = "https://www.wikidata.org/w/api.php";
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

export async function fetchWikidataId(title: string): Promise<string | null> {
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
    return Object.values(data.query?.pages ?? {})[0]?.pageprops?.wikibase_item ?? null;
  } catch {
    return null;
  }
}

export async function fetchInstanceOfLabels(qid: string): Promise<string[]> {
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
    if (!targetIds.length) return [];

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
