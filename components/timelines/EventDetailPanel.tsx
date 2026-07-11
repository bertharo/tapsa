"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { TimelineEvent } from "@/lib/timeline-types";
import { CATEGORY_LABELS } from "@/lib/timeline-themes";

export default function EventDetailPanel({
  event,
  onClose,
}: {
  event: TimelineEvent | null;
  onClose: () => void;
}) {
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
            className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] md:bg-ink/10"
          />
          <motion.aside
            key={event.id}
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-ink/10 bg-paper shadow-node md:max-w-lg"
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink/5 px-6 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
                  {event.yearLabel} · {CATEGORY_LABELS[event.category] ?? event.category}
                </p>
                <h2 className="mt-1 font-serif text-2xl font-medium leading-tight text-ink">
                  {event.title}
                </h2>
                <p className="mt-1 text-xs text-ink-faint">{event.era}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-ink/10 px-3 py-1 text-sm text-ink-muted transition hover:text-ink"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="font-serif text-lg leading-relaxed text-ink-soft">{event.hook}</p>
              <div className="mt-4 space-y-3 font-serif text-[15px] leading-relaxed text-ink-soft">
                {event.detail.split(/\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>

            <div className="border-t border-ink/5 px-6 py-4">
              <Link
                href={`/topic/${event.wikipediaSlug}`}
                className="block rounded-xl bg-ink px-4 py-2.5 text-center text-sm font-medium text-paper transition hover:bg-ink-soft"
              >
                Explore {event.wikipediaTitle} on Tapsa →
              </Link>
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(event.wikipediaTitle.replace(/\s+/g, "_"))}`}
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
