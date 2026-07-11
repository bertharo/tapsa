"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TapsaTimeline, TimelineEra, TimelineEvent } from "@/lib/timeline-types";
import OrientationHero from "./OrientationHero";
import EraChapter from "./EraChapter";
import LandmarkCard from "./LandmarkCard";
import ContextMarker from "./ContextMarker";

type Props = {
  timeline: TapsaTimeline;
  eraColors: Map<string, string>;
  selectedId: string | null;
  onSelect: (event: TimelineEvent) => void;
  onEraVisible?: (eraId: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

function useRevealOnScroll(enabled: boolean) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "80px", threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled]);

  return { ref, visible };
}

type EventRowProps = {
  event: TimelineEvent;
  accentColor: string;
  selected: boolean;
  onSelect: () => void;
  reducedMotion: boolean;
};

function EventRow({ event, accentColor, selected, onSelect, reducedMotion }: EventRowProps) {
  const { ref, visible } = useRevealOnScroll(!reducedMotion);

  return (
    <li ref={ref} className="relative pl-10 md:pl-12">
      <span
        className="absolute left-3 top-8 z-10 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[#0b1026]"
        style={{
          backgroundColor: accentColor,
          boxShadow: `0 0 10px ${accentColor}`,
        }}
      />

      {event.transitionalText && (
        <p className="mb-4 font-timeline-serif text-sm italic leading-relaxed text-white/45">
          {event.transitionalText}
        </p>
      )}

      {event.tier === "landmark" ? (
        <LandmarkCard
          event={event}
          accentColor={accentColor}
          selected={selected}
          visible={visible}
          onClick={onSelect}
        />
      ) : (
        <ContextMarker
          event={event}
          accentColor={accentColor}
          selected={selected}
          visible={visible}
          onClick={onSelect}
        />
      )}
    </li>
  );
}

export default function HistorianTimeline({
  timeline,
  eraColors,
  selectedId,
  onSelect,
  onEraVisible,
  scrollRef: externalScrollRef,
}: Props) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;
  const [scrollY, setScrollY] = useState(0);
  const [threadProgress, setThreadProgress] = useState(0);
  const reducedMotion = useReducedMotion();

  const { events, eras } = timeline;

  const sorted = useMemo(
    () => [...events].sort((a, b) => a.sortKey - b.sortKey),
    [events],
  );

  const eraById = useMemo(() => new Map(eras.map((e) => [e.id, e])), [eras]);

  const grouped = useMemo(() => {
    const groups: { era: TimelineEra; events: TimelineEvent[] }[] = [];
    let lastEraId: string | null = null;
    for (const ev of sorted) {
      if (ev.eraId !== lastEraId) {
        const era = eraById.get(ev.eraId) ?? eras[0];
        if (era) groups.push({ era, events: [] });
        lastEraId = ev.eraId;
      }
      groups[groups.length - 1]?.events.push(ev);
    }
    return groups;
  }, [sorted, eraById, eras]);

  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    setScrollY(root.scrollTop);
    const max = root.scrollHeight - root.clientHeight;
    setThreadProgress(max > 0 ? root.scrollTop / max : 0);
  }, [scrollRef]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [onScroll, scrollRef]);

  useEffect(() => {
    if (!onEraVisible) return;
    const root = scrollRef.current;
    const headers = grouped.map((g) => document.getElementById(`era-${g.era.id}`));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id;
        if (top) onEraVisible(top.replace("era-", ""));
      },
      { root, rootMargin: "-15% 0px -55% 0px", threshold: [0, 0.2, 0.5] },
    );
    headers.forEach((h) => h && obs.observe(h));
    return () => obs.disconnect();
  }, [grouped, onEraVisible, scrollRef]);

  return (
    <div ref={scrollRef as React.RefObject<HTMLDivElement>} className="historian-scroll relative min-h-0 flex-1 overflow-y-auto">
      <div className="pointer-events-none sticky top-0 z-0 h-0 overflow-visible" aria-hidden>
        <div
          className="night-stars night-stars-1 absolute left-0 right-0 h-[120vh]"
          style={{
            transform: reducedMotion ? undefined : `translate3d(0, ${-scrollY * 0.05}px, 0)`,
          }}
        />
        <div
          className="night-stars night-stars-2 absolute left-0 right-0 h-[120vh]"
          style={{
            transform: reducedMotion ? undefined : `translate3d(0, ${-scrollY * 0.02}px, 0)`,
          }}
        />
      </div>

      <div className="relative z-10">
        <OrientationHero timeline={timeline} />

        <div className="relative mx-auto max-w-2xl px-4 pb-20 md:px-6">
          <div className="pointer-events-none absolute bottom-0 left-[1.35rem] top-0 w-px md:left-6" aria-hidden>
            <div className="h-full w-full bg-white/10" />
            <div
              className="absolute left-0 top-0 w-full origin-top bg-gradient-to-b from-[#c9a24b] via-[#45b8be] to-[#d1603d]"
              style={{
                height: "100%",
                transform: `scaleY(${reducedMotion ? 1 : Math.max(0.04, threadProgress)})`,
                opacity: 0.85,
              }}
            />
          </div>

          {grouped.map(({ era, events: eraEvents }) => {
            const color = eraColors.get(era.id) ?? "#c9a24b";
            return (
              <section key={era.id} className="relative">
                <EraChapter era={era} accentColor={color} id={`era-${era.id}`} />
                <ol className="space-y-6">
                  {eraEvents.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      accentColor={color}
                      selected={selectedId === ev.id}
                      onSelect={() => onSelect(ev)}
                      reducedMotion={reducedMotion}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HistorianTimelineSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="relative mx-auto max-w-2xl space-y-6 px-4 py-8 md:px-6">
      <div className="pointer-events-none absolute bottom-0 left-6 top-0 w-px bg-white/10" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse pl-10">
          <div className="h-40 rounded-2xl bg-white/10" />
          <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
          <div className="mt-2 h-3 w-full rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}
