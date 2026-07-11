"use client";

import { motion } from "framer-motion";
import type { TapsaTimeline } from "@/lib/timeline-types";

type Props = {
  timeline: TapsaTimeline;
};

export default function OrientationHero({ timeline }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.25, 1] }}
      className="relative border-b border-white/10 px-4 pb-4 pt-6 md:px-6 md:pt-8"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c9a24b]">
        Tapsa Timelines
      </p>
      <h1 className="font-timeline-serif mt-2 text-3xl font-medium text-white md:text-4xl">
        {timeline.title}
      </h1>
      <p className="mt-3 max-w-2xl font-timeline-serif text-base leading-relaxed text-white/65 md:text-lg">
        {timeline.orientation}
      </p>

      {timeline.sparse && (
        <p className="mt-3 text-sm text-white/50">
          A thin record — {timeline.events.length} dated moment
          {timeline.events.length === 1 ? "" : "s"} found in the sources.
        </p>
      )}

      {timeline.sparse && timeline.adjacentTopics && timeline.adjacentTopics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-white/40">Richer nearby:</span>
          {timeline.adjacentTopics.map((t) => (
            <a
              key={t.slug}
              href={`/timeline/${encodeURIComponent(t.slug)}?q=${encodeURIComponent(t.title)}`}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 transition hover:border-[#c9a24b]/50 hover:text-white"
            >
              {t.title}
            </a>
          ))}
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">
          Scroll to travel through time
        </p>
      </div>
    </motion.section>
  );
}
