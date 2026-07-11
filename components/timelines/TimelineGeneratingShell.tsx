import Link from "next/link";
import { HistorianTimelineSkeleton } from "./HistorianTimeline";
import { TimelineSearchField } from "./TimelineSearch";

export default function TimelineGeneratingShell({ title }: { title: string }) {
  return (
    <div className="night-sky flex h-[100dvh] flex-col overflow-hidden">
      <div className="night-stars night-stars-1 pointer-events-none absolute inset-0 opacity-60" />
      <div className="night-stars night-stars-2 pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative z-10 shrink-0 border-b border-white/10 px-4 py-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c9a24b]"
          >
            Tapsa Timelines
          </Link>
          <h1 className="font-timeline-serif mt-1 text-2xl font-medium text-white md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Building your timeline — first visit can take up to a minute.
          </p>
          <div className="mt-3 max-w-xs">
            <TimelineSearchField autoFocus={false} compact />
          </div>
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <HistorianTimelineSkeleton count={8} />
      </div>

      <footer className="relative z-10 shrink-0 border-t border-white/10 py-2 text-center text-[11px] text-white/35">
        Sourced from Wikipedia · No account, no ads
      </footer>
    </div>
  );
}
