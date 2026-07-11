"use client";

import type { TimelineEra } from "@/lib/timeline-types";

type Props = {
  era: TimelineEra;
  accentColor: string;
  id?: string;
};

export default function EraChapter({ era, accentColor, id }: Props) {
  return (
    <header
      id={id}
      className="era-chapter relative scroll-mt-36 px-1 py-8 md:py-10"
      style={{ "--era-accent": accentColor } as React.CSSProperties}
    >
      <div
        className="pointer-events-none absolute inset-0 -mx-4 opacity-30 md:-mx-8"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accentColor}22 0%, transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}` }}
          />
          <span
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: accentColor }}
          >
            {era.name}
          </span>
        </div>
        {era.summary && (
          <p className="mt-3 max-w-xl font-timeline-serif text-base leading-relaxed text-white/70 md:text-lg">
            {era.summary}
          </p>
        )}
      </div>
    </header>
  );
}
