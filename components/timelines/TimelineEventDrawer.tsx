"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Connection, TapsaNode } from "@/lib/types";
import type { TimelineEvent, TimelineEra } from "@/lib/timeline-types";
import { TIMELINE_TERRACOTTA } from "@/lib/timeline-era-palette";
import { useTimelineNavigate } from "@/hooks/useTimelineNavigate";
import TimelineNavigatingOverlay from "./TimelineNavigatingOverlay";

function ConnectionSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-node">
      <div className="h-4 w-3/4 animate-pulse rounded bg-ink/10" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-ink/5" />
      <div className="h-3 w-full animate-pulse rounded bg-ink/5" />
    </div>
  );
}

export default function TimelineEventDrawer({
  event,
  era,
  onClose,
}: {
  event: TimelineEvent | null;
  era?: TimelineEra;
  onClose: () => void;
}) {
  const { go, navigating } = useTimelineNavigate();
  const [node, setNode] = useState<TapsaNode | null>(null);
  const [nodeLoading, setNodeLoading] = useState(false);

  useEffect(() => {
    if (!event) {
      setNode(null);
      return;
    }
    let cancelled = false;
    setNodeLoading(true);
    setNode(null);

    (async () => {
      try {
        const res = await fetch(`/api/node?slug=${encodeURIComponent(event.wikipediaSlug)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { node?: TapsaNode };
        if (!cancelled && data.node) setNode(data.node);
      } catch {
        /* optional enrichment */
      } finally {
        if (!cancelled) setNodeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [event, onClose]);

  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  const connections = (node?.connections ?? []).filter(
    (c) => !c.slug.includes("~") && c.title.trim().length > 2,
  );
  const summary = node?.summary ?? event?.oneLiner ?? "";
  const body = event?.body ?? node?.lead ?? "";

  return (
    <AnimatePresence>
      {navigating && <TimelineNavigatingOverlay title={navigating} />}
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
            style={{ maxWidth: "min(520px, 94vw)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink/5 px-6 py-5">
              <div>
                <p
                  className="text-xs font-medium uppercase tracking-[0.14em]"
                  style={{ color: TIMELINE_TERRACOTTA }}
                >
                  {event.yearDisplay}
                  {event.category ? ` · ${event.category}` : ""}
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
              <p className="font-timeline-serif text-lg leading-relaxed text-ink-soft">{summary}</p>
              {body && body !== summary && (
                <>
                  <hr className="my-4 border-ink/10" />
                  <div className="space-y-3 text-[15px] leading-relaxed text-ink-soft">
                    {body.split(/\n+/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </>
              )}

              {nodeLoading && (
                <div className="mt-8">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Go deeper
                  </h3>
                  <p className="mb-3 text-sm text-ink-faint">Finding related topics…</p>
                  <div className="grid gap-2.5">
                    <ConnectionSkeleton />
                    <ConnectionSkeleton />
                  </div>
                </div>
              )}

              {connections.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Go deeper
                  </h3>
                  <div className="grid gap-2.5">
                    {connections.map((c: Connection) => (
                      <div
                        key={c.slug}
                        className={`rounded-2xl border bg-white p-4 shadow-node ${
                          c.surprising ? "surprising-glow border-accent/40" : "border-ink/10"
                        }`}
                      >
                        {c.surprising && (
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                            What you missed
                          </span>
                        )}
                        <span className="block text-[15px] font-semibold leading-snug text-ink">
                          {c.title}
                        </span>
                        {c.relationship && (
                          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                            {c.relationship}
                          </span>
                        )}
                        {c.rationale && (
                          <p className="mt-1 text-xs leading-snug text-ink-muted">{c.rationale}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/topic/${c.slug}`}
                            className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper transition hover:bg-ink-soft"
                          >
                            Explore on map →
                          </Link>
                          <button
                            type="button"
                            onClick={() => go(c.title)}
                            className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-accent/40 hover:text-ink"
                          >
                            View timeline →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
