import { getTimelineStore } from "./timeline-cache";
import { generateTimeline } from "./timeline-llm";
import type { TapsaTimeline } from "./timeline-types";
import { fetchGrounding, TopicNotFoundError } from "./wikipedia";
import { titleToSlug } from "./slug";

export { TopicNotFoundError };

export type TimelineResult = { timeline: TapsaTimeline; cacheHit: boolean };

/**
 * Cache check → Wikipedia grounding → LLM timeline generation → persist.
 * Cached permanently by topic slug.
 */
export async function getOrCreateTimeline(rawTopic: string): Promise<TimelineResult> {
  const slug = titleToSlug(rawTopic);
  if (!slug) throw new Error("Missing topic.");

  const store = getTimelineStore();
  const cached = await store.get(slug);
  if (cached) return { timeline: cached, cacheHit: true };

  const grounding = await fetchGrounding(slug);
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
}

export async function peekTimeline(slug: string): Promise<TapsaTimeline | null> {
  return getTimelineStore().get(slug);
}
