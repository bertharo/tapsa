import type { TimelineImageMeta } from "./timeline-types";

const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const UA =
  "Tapsa/0.1 (knowledge-graph explorer; https://tapsa.ai; contact@tapsa.ai) AppleWebKit/537.36";
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA } as const;

const MIN_DIMENSION = 200;
const MAX_CROP_RATIO = 0.25;

const REJECT_MIME = /^image\/svg/i;
const REJECT_FILENAME =
  /\b(logo|icon|flag|seal|emblem|coat of arms|wordmark|symbol|badge|crest)\b/i;

type ImageInfo = {
  url?: string;
  width?: number;
  height?: number;
  mime?: string;
  descriptionurl?: string;
};

async function fetchPageImageInfo(title: string): Promise<ImageInfo | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "pageimages",
    piprop: "thumbnail|name",
    pithumbsize: "800",
    titles: title,
    redirects: "1",
    origin: "*",
  });
  const res = await fetch(`${WIKI_ACTION}?${params.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { thumbnail?: { source?: string; width?: number; height?: number }; pageimage?: string }
      >;
    };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page?.thumbnail?.source) return null;

  const fileName = page.pageimage ?? "";
  if (REJECT_FILENAME.test(fileName)) return null;

  const infoParams = new URLSearchParams({
    action: "query",
    format: "json",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url|size|mime",
    iiurlwidth: "800",
    origin: "*",
  });
  const infoRes = await fetch(`${WIKI_ACTION}?${infoParams.toString()}`, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!infoRes.ok) {
    return {
      url: page.thumbnail.source,
      width: page.thumbnail.width,
      height: page.thumbnail.height,
      mime: "image/jpeg",
    };
  }
  const infoData = (await infoRes.json()) as {
    query?: { pages?: Record<string, { imageinfo?: ImageInfo[] }> };
  };
  const ii = Object.values(infoData.query?.pages ?? {})[0]?.imageinfo?.[0];
  return ii ?? {
    url: page.thumbnail.source,
    width: page.thumbnail.width,
    height: page.thumbnail.height,
    mime: "image/jpeg",
  };
}

function wouldCropTooMuch(
  width: number,
  height: number,
  targetAspect = 16 / 9,
): boolean {
  if (!width || !height) return true;
  const imageAspect = width / height;
  if (imageAspect > targetAspect) {
    const visibleWidth = height * targetAspect;
    return (width - visibleWidth) / width > MAX_CROP_RATIO;
  }
  const visibleHeight = width / targetAspect;
  return (height - visibleHeight) / height > MAX_CROP_RATIO;
}

export function gateImage(info: ImageInfo | null): TimelineImageMeta | null {
  if (!info?.url) return null;
  const mime = info.mime ?? "image/jpeg";
  if (REJECT_MIME.test(mime)) return null;
  if (REJECT_FILENAME.test(info.url)) return null;

  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (width < MIN_DIMENSION && height < MIN_DIMENSION) return null;
  if (wouldCropTooMuch(width, height)) return null;

  return { url: info.url, width, height, mime };
}

/** Fetch and gate a Wikipedia lead image for an article title. */
export async function fetchGatedWikiImage(wikiTitle: string): Promise<TimelineImageMeta | null> {
  const info = await fetchPageImageInfo(wikiTitle);
  return gateImage(info);
}
