"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TapsaTimeline, TimelineEvent } from "@/lib/timeline-types";
import { eraColorMap, TIMELINE_TERRACOTTA } from "@/lib/timeline-era-palette";
import CategoryGlyph from "./CategoryGlyph";

const COL_W_DESKTOP = 300;
const COL_W_MOBILE = 240;
const TRACK_PAD = 80;

type Props = {
  timeline: TapsaTimeline;
  activeEras: Set<string>;
  selectedId: string | null;
  onSelect: (event: TimelineEvent) => void;
};

export default function NightSkyCanvas({
  timeline,
  activeEras,
  selectedId,
  onSelect,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [colW, setColW] = useState(COL_W_DESKTOP);
  const colors = useMemo(() => eraColorMap(timeline.eras), [timeline.eras]);

  const trackWidth =
    timeline.events.length * colW + TRACK_PAD * 2;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setColW(mq.matches ? COL_W_MOBILE : COL_W_DESKTOP);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const onScroll = useCallback(() => {
    if (trackRef.current) setScrollX(trackRef.current.scrollLeft);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = trackRef.current;
    if (!el) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      el.scrollBy({ left: colW, behavior: "smooth" });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      el.scrollBy({ left: -colW, behavior: "smooth" });
    }
  }, [colW]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        el.scrollLeft += e.deltaX || e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Era band column spans
  const eraSpans = useMemo(() => {
    const spans: { eraId: string; startCol: number; endCol: number; showLabel: boolean }[] = [];
    for (const era of timeline.eras) {
      const indices = timeline.events
        .map((e, i) => (e.eraId === era.id ? i : -1))
        .filter((i) => i >= 0);
      if (!indices.length) continue;
      spans.push({
        eraId: era.id,
        startCol: indices[0],
        endCol: indices[indices.length - 1],
        showLabel: true,
      });
    }
    return spans;
  }, [timeline.events, timeline.eras]);

  return (
    <div className="night-sky relative min-h-0 flex-1">
      <div
        ref={trackRef}
        className="night-sky-track timeline-scroll relative h-full overflow-x-auto overflow-y-hidden outline-none"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Historical timeline — scroll horizontally to travel through time"
      >
        {/* Parallax star layers */}
        <div
          className="night-stars night-stars-1 pointer-events-none absolute inset-0"
          style={{ transform: `translate3d(${-scrollX * 0.08}px, 0, 0)` }}
        />
        <div
          className="night-stars night-stars-2 pointer-events-none absolute inset-0"
          style={{ transform: `translate3d(${-scrollX * 0.03}px, 0, 0)` }}
        />
        <div className="night-comet pointer-events-none absolute" aria-hidden />

        <div
          className="relative h-full min-h-[520px]"
          style={{ width: trackWidth }}
        >
          {/* Horizontal spine */}
          <div
            className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/20"
            style={{ left: TRACK_PAD, width: trackWidth - TRACK_PAD * 2 }}
          />

          {/* Era bands */}
          <div className="absolute bottom-0 left-0 right-0 h-16">
            {eraSpans.map((span) => {
              const color = colors.get(span.eraId) ?? "#c9a24b";
              const left = TRACK_PAD + span.startCol * colW;
              const width = (span.endCol - span.startCol + 1) * colW;
              const era = timeline.eras.find((e) => e.id === span.eraId);
              return (
                <div
                  key={span.eraId}
                  className="absolute bottom-0 flex h-full items-end pb-2"
                  style={{
                    left,
                    width,
                    background: `linear-gradient(to top, ${color}22, transparent)`,
                    borderTop: `2px solid ${color}55`,
                  }}
                >
                  {span.showLabel && era && (
                    <span
                      className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"
                      style={{ color: `${color}cc` }}
                    >
                      {era.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Event columns */}
          {timeline.events.map((event, i) => {
            const color = colors.get(event.eraId) ?? "#c9a24b";
            const active = activeEras.has(event.eraId);
            const above = i % 2 === 0;
            const left = TRACK_PAD + i * colW + colW / 2;

            return (
              <EventColumn
                key={event.id}
                event={event}
                left={left}
                above={above}
                color={color}
                dimmed={!active}
                selected={selectedId === event.id}
                mobileStack={colW <= COL_W_MOBILE}
                onSelect={() => onSelect(event)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventColumn({
  event,
  left,
  above,
  color,
  dimmed,
  selected,
  mobileStack,
  onSelect,
}: {
  event: TimelineEvent;
  left: number;
  above: boolean;
  color: string;
  dimmed: boolean;
  selected: boolean;
  mobileStack: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3, root: el.closest(".night-sky-track") },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const stackAbove = mobileStack ? true : above;
  const opacity = dimmed ? 0.18 : 1;
  const pointer = dimmed ? "none" : "auto";

  return (
    <div
      ref={ref}
      className="absolute top-0 flex h-full flex-col items-center"
      style={{
        left,
        width: mobileStack ? 240 : 300,
        transform: "translateX(-50%)",
        opacity,
        pointerEvents: pointer,
        transition: "opacity 0.35s ease",
      }}
    >
      {stackAbove ? (
        <>
          <div
            className={`mt-8 w-[88%] transition-all duration-700 ease-out ${
              visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
          >
            <EventCard event={event} selected={selected} onSelect={onSelect} imageEdge="top" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-end pb-[calc(50%-6px)]">
            <div className="w-px flex-1 max-h-12" style={{ backgroundColor: `${color}88` }} />
            <SpineNode event={event} color={color} selected={selected} onSelect={onSelect} />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-start pt-[calc(50%-6px)]">
            <SpineNode event={event} color={color} selected={selected} onSelect={onSelect} />
            <div className="w-px flex-1 max-h-12" style={{ backgroundColor: `${color}88` }} />
          </div>
          <div
            className={`mb-20 w-[88%] transition-all duration-700 ease-out ${
              visible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
            }`}
          >
            <EventCard event={event} selected={selected} onSelect={onSelect} imageEdge="bottom" />
          </div>
        </>
      )}
    </div>
  );
}

function SpineNode({
  event,
  color,
  selected,
  onSelect,
}: {
  event: TimelineEvent;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${event.yearDisplay}: ${event.title}`}
      className="night-spine-node z-10 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/30 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      style={{
        backgroundColor: color,
        boxShadow: selected
          ? `0 0 16px ${color}, 0 0 32px ${color}88`
          : `0 0 8px ${color}aa`,
        transform: selected ? "scale(1.35)" : "scale(1)",
      }}
    />
  );
}

function EventCard({
  event,
  selected,
  onSelect,
  imageEdge,
}: {
  event: TimelineEvent;
  selected: boolean;
  onSelect: () => void;
  imageEdge: "top" | "bottom";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = event.imageUrl && !imgFailed;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`event-card relative w-full rounded-2xl bg-white p-4 text-left shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        selected ? "ring-2 ring-white/40" : ""
      } ${imageEdge === "top" ? "pt-10" : "pb-10"}`}
    >
      <div
        className={`absolute ${imageEdge === "top" ? "-top-5" : "-bottom-5"} left-4 h-14 w-14 overflow-hidden rounded-xl border-2 border-white shadow-md`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <CategoryGlyph category={event.category} className="h-full w-full text-xl" />
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <span
          className="font-timeline-serif text-sm font-semibold tabular-nums"
          style={{ color: TIMELINE_TERRACOTTA }}
        >
          {event.yearDisplay}
        </span>
        <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
          {event.category}
        </span>
      </div>
      <h3 className="font-timeline-serif mt-1.5 text-base font-medium leading-snug text-ink">
        {event.title}
      </h3>
      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-ink-muted">
        {event.oneLiner}
      </p>
    </button>
  );
}
