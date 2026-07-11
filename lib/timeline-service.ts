import { cache } from "react";
import { getTimelineStore } from "./timeline-cache";
import { generateTimeline } from "./timeline-llm";
import type { TapsaTimeline } from "./timeline-types";
import { fetchTimelineGrounding, TopicNotFoundError } from "./wikipedia";
import { titleToSlug } from "./slug";

export { TopicNotFoundError };

export type TimelineResult = { timeline: TapsaTimeline; cacheHit: boolean };

/**
 * Cache check → Wikipedia summary → LLM timeline generation → persist.
 * Cached permanently by canonical topic slug. Wrapped in React.cache so
 * generateMetadata and the page component share one call per request.
 */
export const getOrCreateTimeline = cache(async (rawTopic: string): Promise<TimelineResult> => {
  const slug = titleToSlug(rawTopic);
  if (!slug) throw new Error("Missing topic.");

  const store = getTimelineStore();
  const cached = await store.get(slug);
  if (cached) return { timeline: cached, cacheHit: true };

  const grounding = await fetchTimelineGrounding(slug);

  // Redirects may resolve to a different canonical slug (e.g. usa → united-states).
  if (grounding.slug !== slug) {
    const canonicalCached = await store.get(grounding.slug);
    if (canonicalCached) return { timeline: canonicalCached, cacheHit: true };
  }

  const topic = rawTopic.trim() || grounding.title;
  const timeline = await generateTimeline(
    grounding.slug,
    topic,
    grounding.title,
    grounding.lead ?? grounding.summary,
    grounding.sourceUrl,
  );

  await store.set(timeline);
  return { timeline, cacheHit: false };
});
