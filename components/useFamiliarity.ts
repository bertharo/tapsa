"use client";

import { useCallback, useEffect, useState } from "react";
import { FAMILIARITY_STORAGE_KEY } from "@/lib/familiarity";

/**
 * Client-side "I know this" set, persisted in localStorage. Survives reloads so
 * the predict-then-reveal cards can anchor on what the learner already knows.
 * Degrades gracefully when storage is unavailable (private mode, quota) — the
 * set simply stays in memory for the session.
 */
export function useFamiliarity() {
  const [known, setKnown] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAMILIARITY_STORAGE_KEY);
      if (raw) setKnown(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* corrupt or unavailable storage — start empty */
    }
  }, []);

  const toggleKnown = useCallback((slug: string) => {
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      try {
        localStorage.setItem(FAMILIARITY_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* keep the in-memory set even if persistence fails */
      }
      return next;
    });
  }, []);

  const isKnown = useCallback((slug: string) => known.has(slug), [known]);

  return { known, isKnown, toggleKnown };
}
