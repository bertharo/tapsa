"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export type Crumb = { slug: string; title: string };

export default function Breadcrumb({
  crumbs,
  currentIndex,
  onJump,
}: {
  crumbs: Crumb[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
  }, [crumbs.length]);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Your trail"
      className="trail-scroll flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap py-1"
    >
      {crumbs.map((c, i) => {
        const isCurrent = i === currentIndex;
        return (
          <span key={`${c.slug}-${i}`} className="flex items-center">
            {i > 0 && <span className="mx-1 text-ink-faint">→</span>}
            <motion.button
              layout
              onClick={() => onJump(i)}
              className={`rounded-full px-2.5 py-1 text-sm transition ${
                isCurrent
                  ? "bg-ink text-paper"
                  : "text-ink-muted hover:bg-paper-soft hover:text-ink"
              }`}
              title={isCurrent ? "You are here" : `Back to ${c.title}`}
            >
              {c.title}
            </motion.button>
          </span>
        );
      })}
      <div ref={endRef} />
    </nav>
  );
}
