"use client";

import type { TimelineEra } from "@/lib/timeline-types";

type Props = {
  eras: TimelineEra[];
  eraColors: Map<string, string>;
  activeEraId: string | null;
  onEraClick: (eraId: string) => void;
};

export default function EraStrip({ eras, eraColors, activeEraId, onEraClick }: Props) {
  return (
    <nav
      aria-label="Timeline eras"
      className="timeline-scroll flex gap-2 overflow-x-auto pb-1 pt-2"
    >
      {eras.map((era) => {
        const color = eraColors.get(era.id) ?? "#c9a24b";
        const active = activeEraId === era.id;
        return (
          <button
            key={era.id}
            type="button"
            onClick={() => onEraClick(era.id)}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{
              borderColor: active ? color : `${color}55`,
              backgroundColor: active ? `${color}33` : "rgba(255,255,255,0.06)",
              color: active ? color : "rgba(255,255,255,0.55)",
              boxShadow: active ? `0 0 16px ${color}44` : "none",
            }}
          >
            {era.name}
          </button>
        );
      })}
    </nav>
  );
}
