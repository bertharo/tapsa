"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect } from "react";
import type { TimelineEvent, TimelineEra } from "@/lib/timeline-types";
import { TIMELINE_TERRACOTTA } from "@/lib/timeline-era-palette";

export default function EventDetailPanel({
  event,
  era,
  onClose,
}: {
  event: TimelineEvent | null;
  era?: TimelineEra;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.button
            type="button"
            aria-label="Close detail panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
          />
          <motion.aside
            key={event.id}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.25, 1] }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col bg-paper shadow-2xl"
            style={{ maxWidth: "min(460px, 92vw)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink/5 px-6 py-5">
              <div>
                <p
                  className="text-xs font-medium uppercase tracking-[0.14em]"
                  style={{ color: TIMELINE_TERRACOTTA }}
                >
                  {event.yearDisplay} · {event.category}
                </p>
                <h2 className="font-timeline-serif mt-1 text-2xl font-medium leading-tight text-ink">
                  {event.title}
                </h2>
                {era && <p className="mt-1 text-xs text-ink-faint">{era.name}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-ink/10 px-3 py-1 text-sm text-ink-muted transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="font-timeline-serif text-lg leading-relaxed text-ink-soft">
                {event.oneLiner}
              </p>
              <hr className="my-4 border-ink/10" />
              <div className="space-y-3 text-[15px] leading-relaxed text-ink-soft">
                {event.body.split(/\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>

            <div className="border-t border-ink/5 px-6 py-4">
              <Link
                href={`/topic/${event.wikipediaSlug}`}
                className="block rounded-full bg-ink px-4 py-2.5 text-center text-sm font-medium text-paper transition hover:bg-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Explore {event.wikiTitle.replace(/_/g, " ")} on Tapsa →
              </Link>
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(event.wikiTitle)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-center text-xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline"
              >
                Read on Wikipedia ↗
              </a>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
