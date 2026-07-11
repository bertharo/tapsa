"use client";

import Link from "next/link";
import { useState } from "react";
import type { TapsaTimeline, TimelineEvent } from "@/lib/timeline-types";
import TimelineCanvas from "./TimelineCanvas";
import EventDetailPanel from "./EventDetailPanel";
import { TimelineSearchField } from "./TimelineSearch";

export default function TimelineExplorer({ timeline }: { timeline: TapsaTimeline }) {
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-paper">
      <header className="shrink-0 border-b border-ink/5 px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/timelines"
              className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint transition hover:text-accent"
            >
              Tapsa Timelines
            </Link>
            <h1 className="truncate font-serif text-xl font-medium text-ink md:text-2xl">
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
            <div className="w-40 md:w-52">
              <TimelineSearchField autoFocus={false} compact />
            </div>
          </div>
        </div>
      </header>

      <TimelineCanvas
        timeline={timeline}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      <footer className="shrink-0 border-t border-ink/5 py-2 text-center text-[11px] text-ink-faint">
        Sourced from Wikipedia · No account, no ads
      </footer>

      <EventDetailPanel event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
