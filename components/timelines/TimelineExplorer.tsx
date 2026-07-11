"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TapsaTimeline, TimelineEvent } from "@/lib/timeline-types";
import { eraColorMap } from "@/lib/timeline-era-palette";
import HistorianTimeline from "./HistorianTimeline";
import EraStrip from "./EraStrip";
import TimelineEventDrawer from "./TimelineEventDrawer";
import { TimelineSearchField } from "./TimelineSearch";

export default function TimelineExplorer({ timeline }: { timeline: TapsaTimeline }) {
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [activeEraId, setActiveEraId] = useState<string | null>(timeline.eras[0]?.id ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colors = useMemo(() => eraColorMap(timeline.eras), [timeline.eras]);

  const scrollToEra = useCallback((eraId: string) => {
    setActiveEraId(eraId);
    const root = scrollRef.current;
    const el = document.getElementById(`era-${eraId}`);
    if (!root || !el) return;
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 12;
    root.scrollTo({ top, behavior: "smooth" });
  }, []);

  const selectedEra = selected
    ? timeline.eras.find((e) => e.id === selected.eraId)
    : undefined;

  return (
    <div className="night-sky flex h-[100dvh] flex-col overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-[#0b1026]/90 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link
            href="/"
            className="font-timeline-serif text-sm font-medium text-white/80 transition hover:text-[#c9a24b]"
          >
            ← Timelines
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/explore"
              className="hidden rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 transition hover:border-[#c9a24b]/40 hover:text-white sm:inline"
            >
              Map
            </Link>
            <div className="w-36 md:w-44">
              <TimelineSearchField autoFocus={false} compact />
            </div>
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-6xl">
          <EraStrip
            eras={timeline.eras}
            eraColors={colors}
            activeEraId={activeEraId}
            onEraClick={scrollToEra}
          />
        </div>
      </header>

      <HistorianTimeline
        timeline={timeline}
        eraColors={colors}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onEraVisible={setActiveEraId}
        scrollRef={scrollRef}
      />

      <footer className="shrink-0 border-t border-white/10 py-2 text-center text-[11px] text-white/35">
        Sourced from Wikipedia · No account, no ads
      </footer>

      <TimelineEventDrawer event={selected} era={selectedEra} onClose={() => setSelected(null)} />
    </div>
  );
}
