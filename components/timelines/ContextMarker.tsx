"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/lib/timeline-types";

type Props = {
  event: TimelineEvent;
  accentColor: string;
  selected?: boolean;
  visible?: boolean;
  onClick: () => void;
};

export default function ContextMarker({
  event,
  accentColor,
  selected = false,
  visible = true,
  onClick,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`transition ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
      style={{ transitionDuration: "500ms" }}
    >
      <button
        type="button"
        onClick={() => {
          setExpanded((e) => !e);
          onClick();
        }}
        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
          selected ? "border-white/40 bg-white/10" : "border-white/15 bg-white/5"
        }`}
      >
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
        />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-medium tabular-nums text-white/50">
            {event.yearDisplay}
          </span>
          <span className="ml-2 text-sm font-medium text-white/85">{event.title}</span>
          {expanded && (
            <p className="mt-1.5 text-xs leading-relaxed text-white/60">{event.oneLiner}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-white/40">{expanded ? "−" : "+"}</span>
      </button>
    </div>
  );
}
