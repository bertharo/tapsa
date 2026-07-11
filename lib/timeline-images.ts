import type { TapsaTimeline } from "./timeline-types";
import { fetchGatedWikiImage } from "./timeline-images-gate";

/** Attach gated Wikipedia images to landmark timeline events. */
export async function attachEventImages(timeline: TapsaTimeline): Promise<TapsaTimeline> {
  const events = await Promise.all(
    timeline.events.map(async (e) => {
      if (e.tier === "context" && !e.imageUrl) return e;
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
