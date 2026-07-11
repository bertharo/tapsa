import { cache } from "react";
import { getTimelineStore } from "./timeline-cache";
import {
  TimelineTooThinError,
  TimelineUnavailableError,
  TopicNotFoundError,
} from "./timeline-errors";
import { attachEventImages } from "./timeline-images";
import { generateTimeline, TimelineExtractionError } from "./timeline-llm";
import type { TapsaTimeline } from "./timeline-types";
import {
  resolveTimelineArticle,
  THIN_ARTICLE_WORD_LIMIT,
  timelineCacheKey,
  type ResolvedTimelineArticle,
} from "./timeline-resolve";
import { titleToSlug } from "./slug";

export { TimelineTooThinError, TopicNotFoundError, TimelineUnavailableError };

export type TimelineResult = { timeline: TapsaTimeline; cacheHit: boolean };

const JUNK_EVENT = /^chapter\s*\d/i;

function isUsableCached(timeline: TapsaTimeline): boolean {
  if (timeline.schemaVersion !== 3) return false;
  if (!timeline.cacheKey || !timeline.wikiTitle) return false;
  if (!Array.isArray(timeline.events) || timeline.events.length < 8) return false;
  return !timeline.events.some((e) => JUNK_EVENT.test(e.title));
}

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

function mapGenerationError(err: unknown, slug: string, title: string): Error {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("groq_api_key") || msg.includes("tapsa_llm_api_key")) {
    return new TimelineUnavailableError("missing_api_key");
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("413") || msg.includes("too large")) {
    return new TimelineUnavailableError("rate_limit");
  }
  if (
    err instanceof TimelineExtractionError ||
    (err as Error)?.name === "TimelineExtractionError"
  ) {
    return new TimelineTooThinError(slug, title);
  }
  return err instanceof Error ? err : new TimelineUnavailableError("unknown");
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
  if (cached && isUsableCached(cached)) {
    return {
      timeline: { ...cached, slug: requestedSlug, title: displayTitle },
      cacheHit: true,
    };
  }

  let timeline: TapsaTimeline;
  try {
    timeline = await extractWithFallback(requestedSlug, displayTitle, primary, candidate);
  } catch (err) {
    throw mapGenerationError(err, requestedSlug, displayTitle);
  }

  timeline = await attachEventImages(timeline);
  await store.set(timeline);
  return { timeline, cacheHit: false };
});
