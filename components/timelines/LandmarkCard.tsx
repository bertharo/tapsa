"use client";

import Image from "next/image";
import type { TimelineEvent } from "@/lib/timeline-types";
import TypographicFallback from "./TypographicFallback";

type Props = {
  event: TimelineEvent;
  accentColor: string;
  selected?: boolean;
  visible?: boolean;
  onClick: () => void;
};

export default function LandmarkCard({
  event,
  accentColor,
  selected = false,
  visible = true,
  onClick,
}: Props) {
  const imageUrl = event.image?.url ?? event.imageUrl;
  const showImage = Boolean(imageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`event-card group w-full rounded-2xl bg-white/95 text-left shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        selected ? "ring-2 ring-white/50" : ""
      } ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
      style={{ transitionDuration: "700ms", transitionTimingFunction: "cubic-bezier(0.2,0.8,0.25,1)" }}
    >
      {showImage ? (
        <div className="relative h-40 w-full overflow-hidden rounded-t-2xl bg-ink/10">
          <Image
            src={imageUrl!}
            alt=""
            fill
            className="object-cover transition group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 480px"
            unoptimized
          />
        </div>
      ) : (
        <TypographicFallback yearDisplay={event.yearDisplay} accentColor={accentColor} />
      )}

      <div className="p-4 sm:p-5">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: accentColor }}
        >
          {event.yearDisplay} · {event.category}
        </p>
        <h3 className="font-timeline-serif mt-1 text-lg font-medium leading-snug text-ink sm:text-xl">
          {event.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
          {event.oneLiner}
        </p>
        {event.significance && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-faint italic">
            {event.significance}
          </p>
        )}
      </div>
    </button>
  );
}
