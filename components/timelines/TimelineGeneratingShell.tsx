import Link from "next/link";
import { VerticalTimelineSkeleton } from "./VerticalTimeline";
import { TimelineSearchField } from "./TimelineSearch";

export default function TimelineGeneratingShell({ title }: { title: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="shrink-0 border-b border-ink/5 bg-paper px-4 py-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent"
          >
            Tapsa Timelines
          </Link>
          <h1 className="font-timeline-serif mt-1 text-2xl font-medium text-ink md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Building your timeline — first visit can take up to a minute.
          </p>
          <div className="mt-3 max-w-xs">
            <TimelineSearchField autoFocus={false} compact />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <VerticalTimelineSkeleton count={8} />
      </div>

      <footer className="shrink-0 border-t border-ink/5 py-2 text-center text-[11px] text-ink-faint">
        Sourced from Wikipedia · No account, no ads
      </footer>
    </div>
  );
}
