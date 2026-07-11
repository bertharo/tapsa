"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { markTimelineBuilding, timelineUrl } from "@/lib/timeline-nav";
import { titleToSlug } from "@/lib/slug";

export function useTimelineNavigate() {
  const router = useRouter();
  const [navigating, setNavigating] = useState<string | null>(null);

  const go = useCallback(
    (topic: string) => {
      const q = topic.trim();
      if (!q) return;
      const slug = titleToSlug(q);
      if (!slug) return;
      markTimelineBuilding(q);
      setNavigating(q);
      router.push(timelineUrl(slug, q));
    },
    [router],
  );

  return { go, navigating };
}
