"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import type { Connection, TapsaNode } from "@/lib/types";

const SPRING = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 } as const;

function layoutKey(slug: string) {
  return `node-${slug}`;
}

/** Radial coordinates (in %) for the i-th of n connections, starting at top. */
function orbitPosition(i: number, n: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
  const radius = 37;
  return {
    left: 50 + radius * Math.cos(angle),
    top: 50 + radius * Math.sin(angle),
    angle,
  };
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export default function GraphView({
  node,
  loadingSlug,
  onTravel,
}: {
  node: TapsaNode;
  loadingSlug: string | null;
  onTravel: (conn: Connection) => void;
}) {
  const isMobile = useIsMobile();
  const connections = node.connections;

  if (isMobile) {
    return (
      <MobileList node={node} loadingSlug={loadingSlug} onTravel={onTravel} />
    );
  }

  return (
    <LayoutGroup>
      <div className="relative mx-auto h-[clamp(420px,62vh,640px)] w-full max-w-3xl">
        {/* Connecting lines layer (re-drawn per center). */}
        <AnimatePresence>
          <motion.svg
            key={`lines-${node.slug}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            preserveAspectRatio="none"
          >
            {connections.map((c, i) => {
              const p = orbitPosition(i, connections.length);
              return (
                <line
                  key={c.slug}
                  x1="50%"
                  y1="50%"
                  x2={`${p.left}%`}
                  y2={`${p.top}%`}
                  stroke={c.surprising ? "rgba(201,97,47,0.4)" : "rgba(10,10,11,0.12)"}
                  strokeWidth={1}
                  strokeDasharray={c.surprising ? "4 4" : undefined}
                />
              );
            })}
          </motion.svg>
        </AnimatePresence>

        {/* Center node */}
        <motion.div
          layout
          layoutId={layoutKey(node.slug)}
          transition={SPRING}
          className="absolute left-1/2 top-1/2 z-10 w-[min(78%,360px)] -translate-x-1/2 -translate-y-1/2"
        >
          <CenterCard node={node} />
        </motion.div>

        {/* Orbit connection nodes */}
        <AnimatePresence>
          {connections.map((c, i) => {
            const p = orbitPosition(i, connections.length);
            const isLoading = loadingSlug === c.slug;
            return (
              <motion.button
                key={c.slug}
                layout
                layoutId={layoutKey(c.slug)}
                transition={SPRING}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                onClick={() => onTravel(c)}
                style={{ left: `${p.left}%`, top: `${p.top}%` }}
                className="absolute z-20 w-[clamp(150px,20vw,200px)] -translate-x-1/2 -translate-y-1/2"
              >
                <OrbitCard conn={c} loading={isLoading} />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function CenterCard({ node }: { node: TapsaNode }) {
  return (
    <div className="rounded-3xl border border-ink/10 bg-white p-6 text-center shadow-node">
      <span className="mb-2 inline-block text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
        {node.domain}
      </span>
      <h2 className="font-serif text-2xl font-medium leading-tight tracking-tight text-ink">
        {node.title}
      </h2>
      <p className="mt-3 font-serif text-[15px] leading-relaxed text-ink-soft">
        {node.summary}
      </p>
      <a
        href={node.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline"
      >
        Source: Wikipedia ↗
      </a>
    </div>
  );
}

function OrbitCard({ conn, loading }: { conn: Connection; loading: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-3.5 text-left shadow-node transition hover:-translate-y-0.5 hover:shadow-glow ${
        conn.surprising
          ? "surprising-glow border-accent/40"
          : "border-ink/10 hover:border-accent/30"
      }`}
    >
      {conn.surprising && (
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
          What you missed
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold leading-snug text-ink">{conn.title}</span>
        {loading && (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-accent" />
        )}
      </div>
      <p className="mt-1 line-clamp-3 text-xs leading-snug text-ink-muted">
        {conn.rationale}
      </p>
    </div>
  );
}

/** Narrow-screen layout: the radial map collapses to a tappable vertical list. */
function MobileList({
  node,
  loadingSlug,
  onTravel,
}: {
  node: TapsaNode;
  loadingSlug: string | null;
  onTravel: (conn: Connection) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <motion.div
        key={node.slug}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <CenterCard node={node} />
      </motion.div>

      <div className="mt-5 space-y-2.5">
        {node.connections.map((c) => (
          <button
            key={c.slug}
            onClick={() => onTravel(c)}
            className="block w-full text-left"
          >
            <OrbitCard conn={c} loading={loadingSlug === c.slug} />
          </button>
        ))}
      </div>
    </div>
  );
}
