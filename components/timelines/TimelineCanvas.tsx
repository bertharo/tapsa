"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { TapsaTimeline, TimelineEvent } from "@/lib/timeline-types";
import { CATEGORY_LABELS, eraTheme, formatDisplayYear, yearSpan, yearToX } from "@/lib/timeline-themes";

const TRACK_PADDING = 120;
const PX_PER_YEAR = 14;
const MIN_TRACK = 2400;

type Props = {
  timeline: TapsaTimeline;
  selectedId: string | null;
  onSelect: (event: TimelineEvent) => void;
};

export default function TimelineCanvas({ timeline, selectedId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(true);

  const { minYear, maxYear, trackWidth } = useMemo(() => {
    const years = timeline.events.flatMap((e) => [e.year, e.yearEnd ?? e.year]);
    const min = Math.min(...years);
    const max = Math.max(...years);
    const span = yearSpan(min, max);
    const width = Math.max(MIN_TRACK, span * PX_PER_YEAR + TRACK_PADDING * 2);
    return { minYear: min, maxYear: max, trackWidth: width };
  }, [timeline.events]);

  const dismissHint = useCallback(() => setHint(false), []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Era legend */}
      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 trail-scroll md:px-6">
        {timeline.eras.map((era, i) => {
          const theme = eraTheme(i);
          return (
            <div
              key={era.id}
              className="flex shrink-0 items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs shadow-sm"
              title={era.description}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: theme.accent }}
              />
              <span className="font-medium text-ink">{era.name}</span>
            </div>
          );
        })}
      </div>

      {/* Horizontal time river */}
      <div
        ref={scrollRef}
        onScroll={dismissHint}
        onPointerDown={dismissHint}
        className="timeline-scroll relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div
          className="relative h-full min-h-[420px]"
          style={{ width: trackWidth + TRACK_PADDING * 2 }}
        >
          {/* Era bands */}
          {timeline.eras.map((era, i) => {
            const theme = eraTheme(i);
            const left = yearToX(era.startYear, minYear, maxYear, trackWidth) + TRACK_PADDING;
            const right =
              yearToX(era.endYear, minYear, maxYear, trackWidth) + TRACK_PADDING;
            const width = Math.max(right - left, 80);
            return (
              <div
                key={era.id}
                className="absolute top-8 bottom-24 rounded-2xl opacity-90"
                style={{
                  left,
                  width,
                  backgroundColor: theme.bg,
                  borderLeft: `3px solid ${theme.accent}`,
                }}
              >
                <div
                  className="sticky left-0 top-3 px-4 font-serif text-sm font-medium"
                  style={{ color: theme.accent }}
                >
                  {era.name}
                </div>
                <p className="mt-1 max-w-xs px-4 text-xs leading-snug text-ink-muted">
                  {era.description}
                </p>
              </div>
            );
          })}

          {/* Time rail */}
          <div
            className="absolute bottom-16 left-0 right-0 mx-auto h-px bg-ink/15"
            style={{ left: TRACK_PADDING, width: trackWidth }}
          />
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const year = Math.round(minYear + t * yearSpan(minYear, maxYear));
            const x = yearToX(year, minYear, maxYear, trackWidth) + TRACK_PADDING;
            return (
              <div
                key={t}
                className="absolute bottom-10 text-[10px] font-medium tabular-nums text-ink-faint"
                style={{ left: x, transform: "translateX(-50%)" }}
              >
                {formatDisplayYear(year)}
              </div>
            );
          })}

          {/* Events */}
          {timeline.events.map((event, i) => {
            const x = yearToX(event.year, minYear, maxYear, trackWidth) + TRACK_PADDING;
            const stagger = (i % 3) * 56;
            const isSelected = selectedId === event.id;
            const sigHeight = event.significance === 3 ? "min-h-[140px]" : event.significance === 2 ? "min-h-[120px]" : "min-h-[100px]";

            return (
              <div
                key={event.id}
                className="absolute"
                style={{ left: x, top: 48 + stagger, transform: "translateX(-50%)" }}
              >
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 32, scale: 0.92 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ type: "spring", stiffness: 260, damping: 24, delay: (i % 6) * 0.04 }}
                  onClick={() => onSelect(event)}
                  className={`w-[200px] text-left transition md:w-[220px] ${sigHeight}`}
                >
                <div
                  className={`rounded-2xl border bg-white p-3.5 shadow-node transition hover:-translate-y-1 hover:shadow-glow ${
                    isSelected
                      ? "border-accent ring-2 ring-accent/30"
                      : event.significance === 3
                        ? "border-accent/30"
                        : "border-ink/10"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      {event.yearLabel}
                    </span>
                    <span className="rounded-full bg-paper-soft px-1.5 py-0.5 text-[9px] font-medium uppercase text-ink-faint">
                      {CATEGORY_LABELS[event.category]}
                    </span>
                  </div>
                  <h3 className="font-serif text-base font-medium leading-snug text-ink">
                    {event.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-ink-muted">
                    {event.hook}
                  </p>
                </div>
                <div className="mx-auto mt-2 h-3 w-px bg-accent/50" />
                <div className="mx-auto h-2 w-2 rounded-full bg-accent" />
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>

      {hint && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-1.5 text-xs font-medium text-paper"
        >
          Scroll right to travel forward in time →
        </motion.p>
      )}
    </div>
  );
}
