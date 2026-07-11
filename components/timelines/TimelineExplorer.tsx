"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TapsaTimeline, TimelineEvent } from "@/lib/timeline-types";
import { eraColorMap } from "@/lib/timeline-era-palette";
import NightSkyCanvas from "./NightSkyCanvas";
import EventDetailPanel from "./EventDetailPanel";
import { TimelineSearchField } from "./TimelineSearch";

export default function TimelineExplorer({ timeline }: { timeline: TapsaTimeline }) {
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [activeEras, setActiveEras] = useState<Set<string>>(
    () => new Set(timeline.eras.map((e) => e.id)),
  );
  const colors = useMemo(() => eraColorMap(timeline.eras), [timeline.eras]);

  const toggleEra = (eraId: string) => {
    setActiveEras((prev) => {
      const next = new Set(prev);
      if (next.has(eraId)) {
        if (next.size <= 1) return prev;
        next.delete(eraId);
      } else {
        next.add(eraId);
      }
      return next;
    });
  };

  const selectedEra = selected
    ? timeline.eras.find((e) => e.id === selected.eraId)
    : undefined;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-paper">
      {/* Cream chrome */}
      <header className="shrink-0 border-b border-ink/5 bg-paper px-4 py-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/timelines"
                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent"
              >
                Tapsa Timelines
              </Link>
              <h1 className="font-timeline-serif mt-1 text-2xl font-medium text-ink md:text-3xl">
                {timeline.title}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/"
                className="hidden rounded-full border border-ink/10 px-3 py-1.5 text-sm text-ink-soft transition hover:border-accent/40 sm:inline"
              >
                Map
              </Link>
              <div className="w-36 md:w-48">
                <TimelineSearchField autoFocus={false} compact />
              </div>
            </div>
          </div>

          {/* Era filter pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {timeline.eras.map((era) => {
              const color = colors.get(era.id) ?? "#c9a24b";
              const on = activeEras.has(era.id);
              return (
                <button
                  key={era.id}
                  type="button"
                  onClick={() => toggleEra(era.id)}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  style={{
                    borderColor: on ? color : `${color}44`,
                    backgroundColor: on ? `${color}22` : "transparent",
                    color: on ? color : "var(--ink-muted)",
                  }}
                >
                  {era.name}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <NightSkyCanvas
        timeline={timeline}
        activeEras={activeEras}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      <footer className="shrink-0 border-t border-ink/5 bg-paper py-2 text-center text-[11px] text-ink-faint">
        Sourced from Wikipedia · No account, no ads
      </footer>

      <EventDetailPanel event={selected} era={selectedEra} onClose={() => setSelected(null)} />
    </div>
  );
}
