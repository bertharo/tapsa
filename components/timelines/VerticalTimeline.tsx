"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEvent, TimelineEra } from "@/lib/timeline-types";
import { computeTimeMarkers } from "@/lib/timeline-time-markers";
import { TopicTeaserCard, TopicTeaserCardSkeleton } from "@/components/TopicTeaserCard";

const REVEAL_BATCH = 6;

export default function VerticalTimeline({
  events,
  eras,
  eraColors,
  activeEras,
  selectedId,
  onSelect,
  progressive = true,
}: {
  events: TimelineEvent[];
  eras: TimelineEra[];
  eraColors: Map<string, string>;
  activeEras: Set<string>;
  selectedId: string | null;
  onSelect: (event: TimelineEvent) => void;
  progressive?: boolean;
}) {
  const filtered = useMemo(
    () => events.filter((e) => activeEras.has(e.eraId)).sort((a, b) => a.yearSort - b.yearSort),
    [events, activeEras],
  );

  const [visibleCount, setVisibleCount] = useState(
    progressive ? Math.min(REVEAL_BATCH, filtered.length) : filtered.length,
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(progressive ? Math.min(REVEAL_BATCH, filtered.length) : filtered.length);
  }, [filtered.length, progressive]);

  useEffect(() => {
    if (!progressive || visibleCount >= filtered.length) return;
    const t = window.setTimeout(() => {
      setVisibleCount((c) => Math.min(c + REVEAL_BATCH, filtered.length));
    }, 40);
    return () => window.clearTimeout(t);
  }, [visibleCount, filtered.length, progressive]);

  useEffect(() => {
    if (!progressive) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + REVEAL_BATCH, filtered.length));
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length, progressive]);

  const markers = useMemo(() => {
    if (!filtered.length) return [];
    return computeTimeMarkers(filtered[0].yearSort, filtered[filtered.length - 1].yearSort);
  }, [filtered]);

  const eraById = useMemo(() => new Map(eras.map((e) => [e.id, e])), [eras]);
  const visible = filtered.slice(0, visibleCount);

  let lastEraId: string | null = null;
  let lastMarkerIdx = 0;

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div
        className="pointer-events-none absolute bottom-0 left-[1.125rem] top-8 w-px bg-gradient-to-b from-accent/30 via-ink/10 to-transparent md:left-1/2 md:-translate-x-px"
        aria-hidden
      />

      <ol className="relative space-y-8">
        {visible.map((event) => {
          const showEra = event.eraId !== lastEraId;
          if (showEra) lastEraId = event.eraId;
          const era = eraById.get(event.eraId);
          const color = eraColors.get(event.eraId) ?? "var(--accent)";

          const markersToShow: typeof markers = [];
          while (
            lastMarkerIdx < markers.length &&
            markers[lastMarkerIdx].yearSort <= event.yearSort
          ) {
            markersToShow.push(markers[lastMarkerIdx]);
            lastMarkerIdx += 1;
          }

          return (
            <li key={event.id} className="relative">
              {markersToShow.map((m) => (
                <div
                  key={`m-${m.yearSort}`}
                  className="mb-4 flex items-center gap-3 md:justify-center"
                >
                  <span className="hidden h-2 w-2 rounded-full bg-accent/60 md:block" />
                  <span className="rounded-full border border-ink/10 bg-paper px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                    {m.label}
                  </span>
                </div>
              ))}

              {showEra && era && (
                <div className="mb-3 flex items-center gap-2 pl-8 md:pl-0 md:justify-center">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-xs font-semibold uppercase tracking-[0.14em]"
                    style={{ color }}
                  >
                    {era.name}
                  </span>
                </div>
              )}

              <div className="relative pl-8 md:pl-0">
                <span
                  className="absolute left-3 top-6 hidden h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow-sm md:left-1/2 md:block"
                  style={{ backgroundColor: color }}
                />
                <TopicTeaserCard
                  title={event.title}
                  teaser={event.oneLiner}
                  yearDisplay={event.yearDisplay}
                  category={event.category}
                  imageUrl={event.imageUrl}
                  accentColor={color}
                  selected={selectedId === event.id}
                  onClick={() => onSelect(event)}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {progressive && visibleCount < filtered.length && (
        <div ref={sentinelRef} className="h-8" aria-hidden />
      )}

      {!filtered.length && (
        <p className="py-12 text-center text-sm text-ink-muted">
          No events match the selected eras. Toggle an era above to see more.
        </p>
      )}
    </div>
  );
}

export function VerticalTimelineSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="relative mx-auto max-w-2xl space-y-8 px-4 py-8 md:px-6">
      <div
        className="pointer-events-none absolute bottom-0 left-[1.125rem] top-8 w-px bg-ink/5 md:left-1/2 md:-translate-x-px"
        aria-hidden
      />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pl-8 md:pl-0">
          <TopicTeaserCardSkeleton />
        </div>
      ))}
    </div>
  );
}
