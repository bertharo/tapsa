"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { titleToSlug } from "@/lib/slug";

const STARTERS = ["England", "Computers", "Accounting", "Basketball", "Coffee", "Silk Road"];

function useTimelineNav() {
  const router = useRouter();
  return useCallback(
    (topic: string) => {
      const slug = titleToSlug(topic);
      if (!slug) return;
      router.push(`/timelines/${slug}`);
    },
    [router],
  );
}

export function TimelineSearchField({
  autoFocus = true,
  compact = false,
}: {
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const navigate = useTimelineNav();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(topic: string) {
    const q = topic.trim();
    if (!q) return;
    setLoading(true);
    navigate(q);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="relative w-full"
    >
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={compact ? "New topic…" : "What history do you want to travel?"}
        aria-label="Search a topic for its timeline"
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
  );
}

export default function TimelineSearch({ autoFocus = true }: { autoFocus?: boolean }) {
  const navigate = useTimelineNav();

  return (
    <div className="w-full">
      <TimelineSearchField autoFocus={autoFocus} />

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {STARTERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => navigate(t)}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
