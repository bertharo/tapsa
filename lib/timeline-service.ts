import { cache } from "react";
import { getTimelineStore } from "./timeline-cache";
import { attachEventImages } from "./timeline-images";
import { generateTimeline, TimelineExtractionError } from "./timeline-llm";
import type { TapsaTimeline } from "./timeline-types";
import {
  resolveTimelineArticle,
  THIN_ARTICLE_WORD_LIMIT,
  timelineCacheKey,
  type ResolvedTimelineArticle,
} from "./timeline-resolve";
import { TopicNotFoundError } from "./wikipedia";
import { titleToSlug } from "./slug";

export { TopicNotFoundError };

export class TimelineTooThinError extends Error {
  constructor(
    public slug: string,
    public title: string,
  ) {
    super(`Not enough dated history for timeline: ${title}`);
    this.name = "TimelineTooThinError";
  }
}

export type TimelineResult = { timeline: TapsaTimeline; cacheHit: boolean };

async function buildTimeline(
  requestedSlug: string,
  displayTitle: string,
  article: ResolvedTimelineArticle,
): Promise<TapsaTimeline> {
  const cacheKey = timelineCacheKey(article.title, article.revisionId);
  return generateTimeline(
    requestedSlug,
    displayTitle,
    article.extractionTitle,
    article.text,
    article.sourceUrl,
    { revisionId: article.revisionId, cacheKey, supplements: article.supplements },
  );
}

async function extractWithFallback(
  requestedSlug: string,
  displayTitle: string,
  primary: ResolvedTimelineArticle,
  candidate: ResolvedTimelineArticle,
): Promise<TapsaTimeline> {
  try {
    return await buildTimeline(requestedSlug, displayTitle, candidate);
  } catch (err) {
    if (candidate !== primary && err instanceof TimelineExtractionError) {
      return buildTimeline(requestedSlug, displayTitle, primary);
    }
    throw err;
  }
}

export const getOrCreateTimeline = cache(async (rawTopic: string): Promise<TimelineResult> => {
  const requestedSlug = titleToSlug(rawTopic);
  if (!requestedSlug) throw new Error("Missing topic.");

  const displayTitle = rawTopic.trim() || requestedSlug;
  const store = getTimelineStore();

  const primary = await resolveTimelineArticle(displayTitle, { widen: false });
  let candidate = primary;
  if (primary.wordCount < THIN_ARTICLE_WORD_LIMIT) {
    const widened = await resolveTimelineArticle(displayTitle, { widen: true });
    if (widened.supplements.length > 0) candidate = widened;
  }

  const cacheKey = timelineCacheKey(candidate.title, candidate.revisionId);
  const cached = await store.get(cacheKey);
  if (cached) {
    return {
      timeline: { ...cached, slug: requestedSlug, title: displayTitle },
      cacheHit: true,
    };
  }

  let timeline: TapsaTimeline;
  try {
    timeline = await extractWithFallback(requestedSlug, displayTitle, primary, candidate);
  } catch (err) {
    if (err instanceof TimelineExtractionError) {
      throw new TimelineTooThinError(requestedSlug, displayTitle);
    }
    throw err;
  }

  timeline = await attachEventImages(timeline);
  await store.set(timeline);
  return { timeline, cacheHit: false };
});
