"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { titleToSlug } from "@/lib/slug";

const STARTERS = ["England", "Computers", "Accounting", "Basketball", "Coffee", "Silk Road"];

type Suggestion = { slug: string; title: string };

function goToTimeline(topic: string) {
  const q = topic.trim();
  if (!q) return;
  const slug = titleToSlug(q);
  if (!slug) return;
  const url = `/timeline/${encodeURIComponent(slug)}?q=${encodeURIComponent(q)}`;
  window.location.assign(url);
}

export function TimelineSearchField({
  autoFocus = true,
  compact = false,
}: {
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results: Suggestion[] };
        setSuggestions(data.results ?? []);
        setOpen((data.results ?? []).length > 0);
        setActive(-1);
      } catch {
        /* aborted */
      }
    }, 160);
    return () => clearTimeout(handle);
  }, [value]);

  function submit() {
    const chosen = active >= 0 ? suggestions[active] : suggestions[0];
    if (chosen) {
      setLoading(true);
      setOpen(false);
      goToTimeline(chosen.title);
      return;
    }
    if (value.trim()) {
      setLoading(true);
      goToTimeline(value);
    }
  }

  return (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative"
      >
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (!open || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={compact ? "New topic…" : "What history do you want to travel?"}
          aria-label="Search a topic for its timeline"
          aria-autocomplete="list"
          aria-expanded={open}
          className={`w-full rounded-2xl border border-ink/10 bg-white text-ink shadow-node outline-none transition placeholder:text-ink-faint focus:border-accent/40 focus:shadow-glow ${
            compact ? "py-2 pl-3 pr-20 text-sm" : "py-4 pl-5 pr-28 text-lg md:text-xl"
          }`}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-ink font-medium text-paper transition hover:bg-ink-soft disabled:opacity-30 ${
            compact ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"
          }`}
        >
          {loading ? "…" : compact ? "Go" : "Explore"}
        </button>
      </form>

      <AnimatePresence>
        {open && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-node"
            onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
          >
            {suggestions.map((s, i) => (
              <li key={s.slug}>
                <button
                  type="button"
                  onMouseDown={() => {
                    setValue(s.title);
                    setLoading(true);
                    goToTimeline(s.title);
                  }}
                  className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                    i === active ? "bg-paper-soft text-ink" : "text-ink-soft hover:bg-paper-soft hover:text-ink"
                  }`}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TimelineSearch({ autoFocus = true }: { autoFocus?: boolean }) {
  return (
    <div className="w-full">
      <TimelineSearchField autoFocus={autoFocus} />

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {STARTERS.map((t) => (
          <Link
            key={t}
            href={`/timeline/${titleToSlug(t)}?q=${encodeURIComponent(t)}`}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
          >
            {t}
          </Link>
        ))}
      </div>
    </div>
  );
}
