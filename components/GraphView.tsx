"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import type { Connection, TapsaNode } from "@/lib/types";

const SPRING = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 } as const;

function layoutKey(slug: string) {
  return `node-${slug}`;
}

/**
 * Radial coordinates (in %) for the i-th of n connections, starting at top.
 * The orbit is a wide ellipse pushed well outside the center card's footprint
 * so connections never cover the main summary by default.
 */
function orbitPosition(i: number, n: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
  const radiusX = 41;
  const radiusY = 43;
  return {
    left: 50 + radiusX * Math.cos(angle),
    top: 50 + radiusY * Math.sin(angle),
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
  onRead,
  onPrefetch,
}: {
  node: TapsaNode;
  loadingSlug: string | null;
  onTravel: (conn: Connection) => void;
  onRead?: () => void;
  onPrefetch?: (slug: string) => void;
}) {
  const isMobile = useIsMobile();
  const connections = node.connections;

  if (isMobile) {
    return (
      <MobileList
        node={node}
        loadingSlug={loadingSlug}
        onTravel={onTravel}
        onRead={onRead}
        onPrefetch={onPrefetch}
      />
    );
  }

  return (
    <LayoutGroup>
      {onRead && (
        <div className="mb-1 flex justify-center">
          <button
            type="button"
            onClick={onRead}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
          >
            <span className="transition-transform">←</span> Back to summary
          </button>
        </div>
      )}
      <div className="relative mx-auto h-[clamp(560px,80vh,800px)] w-full max-w-5xl">
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

        {/* Orbit connection nodes — draggable, beneath the center card. */}
        <AnimatePresence>
          {connections.map((c, i) => (
            <OrbitNode
              key={c.slug}
              conn={c}
              position={orbitPosition(i, connections.length)}
              loading={loadingSlug === c.slug}
              onTravel={onTravel}
              onPrefetch={onPrefetch}
            />
          ))}
        </AnimatePresence>

        {/* Center node — always on top so the summary stays readable. */}
        <motion.div
          layout
          layoutId={layoutKey(node.slug)}
          transition={SPRING}
          initial={{ x: "-50%", y: "-50%" }}
          animate={{ x: "-50%", y: "-50%" }}
          style={{ left: "50%", top: "50%" }}
          className="absolute z-30 w-[min(64%,320px)]"
        >
          <CenterCard node={node} />
        </motion.div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-faint">
        Tap a card to travel · drag to move it aside
      </p>
    </LayoutGroup>
  );
}

/**
 * A single connection in the radial map. The outer motion.div owns position +
 * centering + the shared-layout recenter animation; the inner motion.div owns
 * free dragging so users can pull a card out of the way of the center summary.
 * Centering is done via framer x/y (-50%) rather than CSS classes so it composes
 * cleanly with scale + drag transforms.
 */
function OrbitNode({
  conn,
  position,
  loading,
  onTravel,
  onPrefetch,
}: {
  conn: Connection;
  position: { left: number; top: number };
  loading: boolean;
  onTravel: (conn: Connection) => void;
  onPrefetch?: (slug: string) => void;
}) {
  const movedRef = useRef(false);
  return (
    <motion.div
      layout
      layoutId={layoutKey(conn.slug)}
      transition={SPRING}
      initial={{ opacity: 0, scale: 0.6, x: "-50%", y: "-50%" }}
      animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
      exit={{ opacity: 0, scale: 0.6, x: "-50%", y: "-50%" }}
      style={{ left: `${position.left}%`, top: `${position.top}%` }}
      className="absolute z-20 w-[clamp(150px,18vw,190px)]"
    >
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.12}
        whileDrag={{ scale: 1.04, zIndex: 40 }}
        onPointerDown={() => {
          movedRef.current = false;
        }}
        onDragStart={() => {
          movedRef.current = true;
        }}
        style={{ touchAction: "none" }}
        className="cursor-grab active:cursor-grabbing"
      >
        <button
          type="button"
          onClick={() => {
            // Suppress the navigation click that fires at the end of a drag.
            if (movedRef.current) {
              movedRef.current = false;
              return;
            }
            onTravel(conn);
          }}
          onMouseEnter={() => onPrefetch?.(conn.slug)}
          className="block w-full text-left"
        >
          <OrbitCard conn={conn} loading={loading} />
        </button>
      </motion.div>
    </motion.div>
  );
}

function CenterCard({ node }: { node: TapsaNode }) {
  // Omit the category entirely when it isn't confidently known (never guess).
  const eyebrow =
    node.kind === "section" && node.parentTitle
      ? `${node.parentTitle} · section`
      : node.domain ?? null;

  return (
    <div className="rounded-3xl border border-ink/10 bg-white p-6 text-center shadow-node">
      {eyebrow && (
        <span className="mb-2 inline-block text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
          {eyebrow}
        </span>
      )}
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
  onRead,
  onPrefetch,
}: {
  node: TapsaNode;
  loadingSlug: string | null;
  onTravel: (conn: Connection) => void;
  onRead?: () => void;
  onPrefetch?: (slug: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      {onRead && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={onRead}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
          >
            ← Back to summary
          </button>
        </div>
      )}
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
            onMouseEnter={() => onPrefetch?.(c.slug)}
            className="block w-full text-left"
          >
            <OrbitCard conn={c} loading={loadingSlug === c.slug} />
          </button>
        ))}
      </div>
    </div>
  );
}
