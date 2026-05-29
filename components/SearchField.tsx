"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type Suggestion = { slug: string; title: string };

export default function SearchField({ autoFocus = true }: { autoFocus?: boolean }) {
  const router = useRouter();
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
        /* aborted or failed; ignore */
      }
    }, 160);
    return () => clearTimeout(handle);
  }, [value]);

  function go(slug: string) {
    if (!slug) return;
    setLoading(true);
    setOpen(false);
    router.push(`/topic/${slug}`);
  }

  function submit() {
    const chosen = active >= 0 ? suggestions[active] : suggestions[0];
    if (chosen) {
      go(chosen.slug);
    } else if (value.trim()) {
      const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      go(slug);
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
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
              setOpen(true);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="What are you curious about?"
          aria-label="Search a topic in science or history"
          className="w-full rounded-2xl border border-ink/10 bg-white px-5 py-4 text-lg text-ink shadow-node outline-none transition placeholder:text-ink-faint focus:border-accent/40 focus:shadow-glow md:text-xl"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-30"
        >
          {loading ? "Opening…" : "Explore"}
        </button>
      </form>

      <AnimatePresence>
        {open && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-node"
            onMouseDown={(e) => {
              // Keep focus so click selects before blur closes the list.
              e.preventDefault();
              if (blurTimer.current) clearTimeout(blurTimer.current);
            }}
          >
            {suggestions.map((s, i) => (
              <li key={s.slug}>
                <button
                  onClick={() => go(s.slug)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center px-5 py-3 text-left text-base transition ${
                    i === active ? "bg-paper-soft text-ink" : "text-ink-soft"
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
