import { fetchWikiLeadImage } from "./wikipedia";
import type { TapsaTimeline } from "./timeline-types";

/** Attach Wikipedia lead thumbnails to each event; failures leave imageUrl unset. */
export async function attachEventImages(timeline: TapsaTimeline): Promise<TapsaTimeline> {
  const events = await Promise.all(
    timeline.events.map(async (e) => {
      const imageUrl = (await fetchWikiLeadImage(e.wikiTitle)) ?? undefined;
      return { ...e, imageUrl };
    }),
  );
  return { ...timeline, events };
}
