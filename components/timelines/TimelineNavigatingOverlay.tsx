"use client";

import TimelineBuildingStatus from "./TimelineBuildingStatus";

export default function TimelineNavigatingOverlay({ title }: { title: string }) {
  return (
    <div
      className="night-sky fixed inset-0 z-[100] flex flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="night-stars night-stars-1 pointer-events-none absolute inset-0 opacity-50" />
      <div className="night-stars night-stars-2 pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative z-10 max-w-md text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c9a24b]">
          Tapsa Timelines
        </p>
        <TimelineBuildingStatus title={title} className="mt-4" />
        <div className="mx-auto mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="timeline-nav-progress h-full w-1/3 rounded-full bg-[#c9a24b]/80" />
        </div>
      </div>
    </div>
  );
}
