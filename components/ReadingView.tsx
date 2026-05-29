"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Connection, SectionRef, TapsaNode } from "@/lib/types";

/** How much of the lead body to show before the "Read more" fold. */
const FOLD_CHARS = 850;

/**
 * Reading-first view of a node: you land here when you travel to a topic, read
 * its summary + longer body, optionally drill into sections, and only reveal
 * the connection graph when you choose to ("Explore connections").
 */
export default function ReadingView({
  node,
  onTravel,
  onExplore,
}: {
  node: TapsaNode;
  onTravel: (conn: Connection) => void;
  onExplore: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const eyebrow =
    node.kind === "section" && node.parentTitle
      ? `${node.parentTitle} · section`
      : node.domain;

  const paragraphs = useMemo(() => splitParagraphs(node.lead ?? ""), [node.lead]);
  const foldedParagraphs = useMemo(
    () => (expanded ? paragraphs : foldParagraphs(paragraphs, FOLD_CHARS)),
    [paragraphs, expanded],
  );
  const hasMore = !expanded && foldedParagraphs.length < paragraphs.length;

  const goDeeper = (s: SectionRef) =>
    onTravel({ slug: s.slug, title: s.title, rationale: "", surprising: false });

  return (
    <motion.article
      key={node.slug}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto w-full max-w-2xl"
    >
      <div className="rounded-3xl border border-ink/10 bg-white px-6 py-7 shadow-node sm:px-9 sm:py-9">
        <span className="inline-block text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </span>
        <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
          {node.title}
        </h1>

        {/* Tight LLM teaser — the lead-in to the longer read. */}
        <p className="mt-4 font-serif text-lg leading-relaxed text-ink-soft">
          {node.summary}
        </p>

        {/* Longer factual body. */}
        {foldedParagraphs.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-ink/5 pt-4 font-serif text-[15px] leading-relaxed text-ink-soft">
            {foldedParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
              >
                Read more
              </button>
            )}
          </div>
        )}

        <a
          href={node.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline"
        >
          Read the full article on Wikipedia ↗
        </a>

        {/* Go deeper: drill into the article's own sections (stays in reading). */}
        {node.sections.length > 0 && (
          <div className="mt-6 border-t border-ink/5 pt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Go deeper
            </h2>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {node.sections.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => goDeeper(s)}
                  className="rounded-lg border border-ink/5 px-3 py-2 text-left text-sm text-ink-soft transition hover:border-accent/30 hover:bg-paper-soft hover:text-ink"
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The deliberate hand-off into the graph — connections stay hidden until here. */}
      {node.connections.length > 0 && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onExplore}
            className="group inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper shadow-sm transition hover:bg-ink-soft"
          >
            Explore {node.connections.length} connection
            {node.connections.length === 1 ? "" : "s"}
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      )}
    </motion.article>
  );
}

/**
 * Split lead text into paragraphs. Wikipedia's plaintext extracts separate
 * paragraphs with single newlines (no intra-paragraph newlines), so we break on
 * any run of newlines. Section bodies have none and stay a single paragraph.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Keep whole paragraphs up to ~limit chars so the fold never cuts mid-sentence. */
function foldParagraphs(paragraphs: string[], limit: number): string[] {
  const out: string[] = [];
  let total = 0;
  for (const p of paragraphs) {
    if (out.length > 0 && total + p.length > limit) break;
    out.push(p);
    total += p.length;
  }
  return out.length ? out : paragraphs.slice(0, 1);
}
