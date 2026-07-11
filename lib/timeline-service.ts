import { cache } from "react";
import { getTimelineStore } from "./timeline-cache";
import {
  TimelineTooThinError,
  TopicNotFoundError,
} from "./timeline-errors";
import { extractTimelineFromSources, isTimelineSufficient } from "./timeline-extract";
import { fetchGatedWikiImage } from "./timeline-images-gate";
import type { TapsaTimeline, TimelineEvent } from "./timeline-types";
import { TIMELINE_SCHEMA_VERSION } from "./timeline-types";
import { resolveArticleTitle, timelineCacheKey } from "./timeline-resolve";
import { resolveChronologicalSources } from "./timeline-sources";
import { titleToSlug } from "./slug";

export { TimelineTooThinError, TopicNotFoundError };
export { TimelineUnavailableError } from "./timeline-errors";

export type TimelineResult = { timeline: TapsaTimeline; cacheHit: boolean };

const JUNK_EVENT = /^(chapter|section|part|unit|module)\s*[\d.:]*/i;

function isUsableCached(timeline: TapsaTimeline): boolean {
  if (timeline.schemaVersion !== TIMELINE_SCHEMA_VERSION) return false;
  if (!timeline.cacheKey || !timeline.wikiTitle) return false;
  if (!Array.isArray(timeline.events) || timeline.events.length < 1) return false;
  return !timeline.events.some((e) => JUNK_EVENT.test(e.title));
}

async function attachGatedImages(timeline: TapsaTimeline): Promise<TapsaTimeline> {
  const events: TimelineEvent[] = await Promise.all(
    timeline.events.map(async (e) => {
      if (e.tier !== "landmark") {
        return { ...e, image: null, imageUrl: undefined };
      }
      const image = await fetchGatedWikiImage(e.wikiTitle);
      return {
        ...e,
        image,
        imageUrl: image?.url,
      };
    }),
  );
  return { ...timeline, events };
}

/** Read a cached timeline without triggering extraction — for OG/metadata. */
export async function peekTimeline(rawTopic: string): Promise<TapsaTimeline | null> {
  try {
    const displayTitle = rawTopic.trim();
    if (!displayTitle) return null;
    const mainTitle = await resolveArticleTitle(displayTitle);
    const chronology = await resolveChronologicalSources(mainTitle, displayTitle);
    const store = getTimelineStore();
    const cached = await store.get(timelineCacheKey(mainTitle, chronology.revisionId));
    if (cached && isUsableCached(cached)) return cached;
    return null;
  } catch {
    return null;
  }
}

export const getOrCreateTimeline = cache(async (rawTopic: string): Promise<TimelineResult> => {
  const requestedSlug = titleToSlug(rawTopic);
  if (!requestedSlug) throw new Error("Missing topic.");

  const displayTitle = rawTopic.trim() || requestedSlug;
  const store = getTimelineStore();

  const mainTitle = await resolveArticleTitle(displayTitle);
  const chronology = await resolveChronologicalSources(mainTitle, displayTitle);
  const revisionCacheKey = timelineCacheKey(mainTitle, chronology.revisionId);

  const revisionCached = await store.get(revisionCacheKey);
  if (revisionCached && isUsableCached(revisionCached)) {
    return {
      timeline: { ...revisionCached, slug: requestedSlug, title: displayTitle },
      cacheHit: true,
    };
  }

  let timeline: TapsaTimeline;
  try {
    timeline = await extractTimelineFromSources({
      requestedSlug,
      displayTitle,
      chronology,
    });
  } catch {
    throw new TimelineTooThinError(requestedSlug, displayTitle);
  }

  if (!isTimelineSufficient(timeline) && timeline.events.length === 0) {
    throw new TimelineTooThinError(requestedSlug, displayTitle);
  }

  timeline = await attachGatedImages(timeline);
  await store.set({ ...timeline, cacheKey: revisionCacheKey });
  return { timeline, cacheHit: false };
});
