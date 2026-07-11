"use client";

import { motion } from "framer-motion";
import type { Connection, TapsaNode } from "@/lib/types";
import { pickPredictPair } from "@/lib/familiarity";
import ConnectionCard from "./ConnectionCard";
import { useFamiliarity } from "./useFamiliarity";
import { ConnectionGridSkeleton, SummarySkeleton } from "./NodeSkeleton";

/**
 * Reading-first view of a node: you land here when you travel to a topic, read
 * its tight teaser, then "go deeper" into RELATED ARTICLES (the node's
 * connections, rendered as tappable cards). The radial map is an optional
 * alternate view of those same connections. The full text lives one click away
 * on Wikipedia — the product's job is connecting ideas, not reprinting articles.
 */
export default function ReadingView({
  node,
  hydrating = false,
  onTravel,
  onExplore,
  onPrefetch,
}: {
  node: TapsaNode;
  hydrating?: boolean;
  onTravel: (conn: Connection) => void;
  onExplore: () => void;
  onPrefetch?: (slug: string) => void;
}) {
  const { known, toggleKnown } = useFamiliarity();
  const anchorKnown = known.has(node.slug);

  // Omit the category entirely when it isn't confidently known (never guess).
  const eyebrow =
    node.kind === "section" && node.parentTitle
      ? `${node.parentTitle} · section`
      : node.domain ?? null;

  // The featured predict→reveal pairing: this node (anchor) + its best target.
  // Section nodes are structural navigation, not learning links, so they keep
  // the plain list.
  const pair = node.kind === "article" ? pickPredictPair(node, known) : null;
  const anchorLede = node.summary.match(/^[^.!?]+[.!?]/)?.[0] ?? node.summary;
  const otherConnections = pair
    ? node.connections.filter((c) => c.slug !== pair.target.slug)
    : node.connections;

  return (
    <motion.article
      key={node.slug}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto w-full max-w-2xl"
    >
      <div className="rounded-3xl border border-ink/10 bg-white px-6 py-7 shadow-node sm:px-9 sm:py-9">
        {eyebrow && (
          <span className="inline-block text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
          {node.title}
        </h1>

        {hydrating && node.connections.length === 0 ? (
          <SummarySkeleton />
        ) : (
          <p className="mt-4 font-serif text-lg leading-relaxed text-ink-soft">{node.summary}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Mark the anchor: what you already know grounds the predict cards. */}
          {node.kind === "article" && (
            <button
              type="button"
              onClick={() => toggleKnown(node.slug)}
              aria-pressed={anchorKnown}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                anchorKnown
                  ? "border-accent/40 bg-accent/5 text-accent"
                  : "border-ink/10 bg-white text-ink-soft hover:border-accent/30 hover:text-ink"
              }`}
            >
              {anchorKnown ? "✓ You know this" : "I know this"}
            </button>
          )}

          {/* Single, clear CTA to the source — no in-app body to compete with it. */}
          <a
            href={node.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft underline-offset-2 transition hover:text-accent hover:underline"
          >
            Read the full article on Wikipedia ↗
          </a>
        </div>
      </div>

      {/* Go deeper: RELATED ARTICLES (the node's connections) as tappable cards. */}
      {node.connections.length > 0 || hydrating ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
              {hydrating && node.connections.length === 0
                ? "Finding connections…"
                : pair
                  ? "Make the connection"
                  : "Go deeper"}
            </h2>
            <button
              type="button"
              onClick={onExplore}
              className="group inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition hover:text-accent"
            >
              View as map
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>

          {/* Featured predict → reveal → elaborate card for the best pairing. */}
          {pair && !hydrating && (
            <ConnectionCard
              anchorSlug={node.slug}
              anchorTitle={node.title}
              anchorLede={anchorLede}
              target={pair.target}
              anchorIsKnown={pair.anchorIsKnown}
              onTravel={onTravel}
              onPrefetch={onPrefetch}
            />
          )}

          {hydrating && node.connections.length === 0 ? (
            <ConnectionGridSkeleton count={4} />
          ) : (
            otherConnections.length > 0 && (
            <>
              {pair && (
                <p className="mb-2 mt-5 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                  Or jump straight in
                </p>
              )}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {otherConnections.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => onTravel(c)}
                    onMouseEnter={() => onPrefetch?.(c.slug)}
                    className={`rounded-2xl border bg-white p-4 text-left shadow-node transition hover:-translate-y-0.5 hover:shadow-glow ${
                      c.surprising
                        ? "surprising-glow border-accent/40"
                        : "border-ink/10 hover:border-accent/30"
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
                  </button>
                ))}
              </div>
            </>
            )
          )}
        </div>
      ) : null}
    </motion.article>
  );
}
