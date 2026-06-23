"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Connection, RelationshipType } from "@/lib/types";
import { RELATIONSHIP_TYPES } from "@/lib/types";
import { buildConnectionShareUrl } from "@/lib/trail";

/**
 * The connection as an active learning unit: predict → reveal → elaborate.
 *
 * Learning science: the gain comes from the learner GENERATING the link before
 * seeing it (generation effect), against something they already know (the
 * anchor), then explaining it in their own words (elaborative interrogation).
 * So we ask for a prediction FIRST and only then reveal the typed relationship
 * and the one precise sentence.
 */
export default function ConnectionCard({
  anchorSlug,
  anchorTitle,
  anchorLede,
  target,
  anchorIsKnown,
  onTravel,
}: {
  anchorSlug: string;
  anchorTitle: string;
  anchorLede?: string;
  target: Connection;
  anchorIsKnown: boolean;
  onTravel: (conn: Connection) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<RelationshipType | null>(null);
  const [guess, setGuess] = useState("");
  const [showElaborate, setShowElaborate] = useState(false);
  const [elaboration, setElaboration] = useState("");
  const [copied, setCopied] = useState(false);

  const shareConnection = async () => {
    const url = buildConnectionShareUrl(window.location.origin, anchorSlug, target.slug);
    const label = `${anchorTitle} ${target.relationship ?? "→"} ${target.title}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: `Tapsa · ${label}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const actual = target.relationship;
  const matched = revealed && picked != null && actual != null && picked === actual;
  const canReveal = picked != null || guess.trim().length > 0;

  return (
    <div className="rounded-3xl border border-ink/10 bg-white p-5 shadow-node sm:p-6">
      {/* anchor — [relationship] — target */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center">
        <span className="font-serif text-lg font-medium text-ink">{anchorTitle}</span>
        <span className="text-ink-faint">—</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
            revealed
              ? "border border-accent/40 bg-accent/5 text-accent"
              : "border border-dashed border-ink/25 text-ink-faint"
          }`}
        >
          {revealed ? actual ?? "connects to" : "?"}
        </span>
        <span className="text-ink-faint">—</span>
        <span className="font-serif text-lg font-medium text-ink">{target.title}</span>
      </div>

      {anchorLede && !revealed && (
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">{anchorLede}</p>
      )}

      {!revealed ? (
        <div className="mt-5">
          <p className="text-center text-sm font-medium text-ink-soft">
            How do you think <span className="text-ink">{anchorTitle}</span> connects to{" "}
            <span className="text-ink">{target.title}</span>?
          </p>
          {!anchorIsKnown && (
            <p className="mt-1 text-center text-[11px] text-ink-faint">
              Tip: mark “I know this” above once {anchorTitle} clicks — predictions land harder
              against what you know.
            </p>
          )}

          {/* Quick-pick the relationship type. */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {RELATIONSHIP_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPicked((p) => (p === t ? null : t))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  picked === t
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-ink/10 bg-white text-ink-soft hover:border-accent/30 hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* …or a free-text guess. */}
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="…or put it in your own words (optional)"
            aria-label="Your guess for how they connect"
            className="mt-3 w-full rounded-xl border border-ink/10 bg-paper-soft px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/40"
          />

          <button
            type="button"
            disabled={!canReveal}
            onClick={() => setRevealed(true)}
            className="mt-4 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-30"
          >
            Reveal the connection
          </button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5"
        >
          {picked != null && actual != null && (
            <p
              className={`text-center text-[11px] font-semibold uppercase tracking-[0.14em] ${
                matched ? "text-accent" : "text-ink-muted"
              }`}
            >
              {matched ? "✓ You called it" : `You guessed “${picked}” — it's “${actual}”`}
            </p>
          )}

          {/* The one precise sentence: HOW they connect. */}
          <p className="mt-2 text-center font-serif text-[15px] leading-relaxed text-ink-soft">
            {target.rationale}
          </p>

          {/* Elaborate (optional): the deepest-processing step. */}
          {!showElaborate ? (
            <button
              type="button"
              onClick={() => setShowElaborate(true)}
              className="mt-4 block w-full text-center text-xs font-medium text-ink-faint transition hover:text-accent"
            >
              Why does this hold? Explain it →
            </button>
          ) : (
            <textarea
              value={elaboration}
              onChange={(e) => setElaboration(e.target.value)}
              rows={2}
              placeholder="In your own words, why does this connection hold?"
              aria-label="Explain why the connection holds"
              className="mt-4 w-full resize-none rounded-xl border border-ink/10 bg-paper-soft px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/40"
            />
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onTravel(target)}
              className="flex-1 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
            >
              Travel to {target.title} →
            </button>
            <button
              type="button"
              onClick={shareConnection}
              className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
            >
              {copied ? "Copied ✓" : "Share"}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
