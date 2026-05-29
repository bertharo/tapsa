"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Connection, TapsaNode } from "@/lib/types";
import GraphView from "./GraphView";
import ReadingView from "./ReadingView";
import Breadcrumb, { type Crumb } from "./Breadcrumb";
import { buildShareUrl } from "@/lib/trail";

type FetchState = { node?: TapsaNode; error?: string };
type ViewMode = "read" | "explore";

async function fetchNode(slug: string): Promise<FetchState> {
  try {
    const res = await fetch(`/api/node?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok) return { error: data?.error ?? "Could not load that topic." };
    return { node: data.node as TapsaNode };
  } catch {
    return { error: "Network hiccup. Try again." };
  }
}

export default function Explorer({
  initialNode,
  initialCrumbs,
}: {
  initialNode: TapsaNode;
  initialCrumbs: Crumb[];
}) {
  const cacheRef = useRef<Map<string, TapsaNode>>(
    new Map([[initialNode.slug, initialNode]]),
  );
  const [crumbs, setCrumbs] = useState<Crumb[]>(
    initialCrumbs.length ? initialCrumbs : [{ slug: initialNode.slug, title: initialNode.title }],
  );
  const [currentIndex, setCurrentIndex] = useState(
    (initialCrumbs.length || 1) - 1,
  );
  const [currentNode, setCurrentNode] = useState<TapsaNode>(initialNode);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Reading-first: every topic opens as a readable summary; the graph of
  // connections is revealed only when the user chooses to explore.
  const [mode, setMode] = useState<ViewMode>("read");

  const syncUrl = useCallback((slug: string, trailSlugs: string[]) => {
    if (typeof window === "undefined") return;
    const url = buildShareUrl(window.location.origin, slug, trailSlugs);
    window.history.replaceState(null, "", url.replace(window.location.origin, ""));
  }, []);

  const travel = useCallback(
    async (conn: Connection) => {
      if (loadingSlug) return;
      setError(null);
      setLoadingSlug(conn.slug);

      let node = cacheRef.current.get(conn.slug);
      if (!node) {
        const result = await fetchNode(conn.slug);
        if (result.error || !result.node) {
          setError(result.error ?? "Could not load that topic.");
          setLoadingSlug(null);
          return;
        }
        node = result.node;
        cacheRef.current.set(node.slug, node);
        cacheRef.current.set(conn.slug, node);
      }

      const resolved = node;
      setCrumbs((prev) => {
        const trimmed = prev.slice(0, currentIndex + 1);
        const next = [...trimmed, { slug: resolved.slug, title: resolved.title }];
        syncUrl(resolved.slug, next.map((c) => c.slug));
        return next;
      });
      setCurrentIndex((i) => i + 1);
      setCurrentNode(resolved);
      setMode("read");
      setLoadingSlug(null);
    },
    [currentIndex, loadingSlug, syncUrl],
  );

  const jump = useCallback(
    async (index: number) => {
      if (index === currentIndex || loadingSlug) return;
      const target = crumbs[index];
      if (!target) return;
      setError(null);

      let node = cacheRef.current.get(target.slug);
      if (!node) {
        setLoadingSlug(target.slug);
        const result = await fetchNode(target.slug);
        if (result.error || !result.node) {
          setError(result.error ?? "Could not reload that node.");
          setLoadingSlug(null);
          return;
        }
        node = result.node;
        cacheRef.current.set(node.slug, node);
        setLoadingSlug(null);
      }
      setCurrentIndex(index);
      setCurrentNode(node);
      setMode("read");
      syncUrl(target.slug, crumbs.slice(0, index + 1).map((c) => c.slug));
    },
    [crumbs, currentIndex, loadingSlug, syncUrl],
  );

  const share = useCallback(async () => {
    const trailSlugs = crumbs.slice(0, currentIndex + 1).map((c) => c.slug);
    const url = buildShareUrl(
      typeof window !== "undefined" ? window.location.origin : "",
      currentNode.slug,
      trailSlugs,
    );
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: `Tapsa · ${currentNode.title}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user dismissed share sheet */
    }
  }, [crumbs, currentIndex, currentNode]);

  const depth = useMemo(() => currentIndex + 1, [currentIndex]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-10 pt-4 md:px-6">
      <header className="flex items-center justify-between gap-3 pb-2">
        <Link
          href="/"
          className="font-serif text-xl font-medium tracking-tight text-ink transition hover:text-accent"
        >
          Tapsa
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-ink-faint sm:inline">
            {depth} {depth === 1 ? "stop" : "stops"} deep
          </span>
          <button
            onClick={share}
            className="rounded-full border border-ink/10 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
          >
            {copied ? "Link copied ✓" : "Share trail"}
          </button>
          <Link
            href="/"
            className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            New
          </Link>
        </div>
      </header>

      <div className="border-y border-ink/5 py-2">
        <Breadcrumb crumbs={crumbs} currentIndex={currentIndex} onJump={jump} />
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2 text-sm text-accent"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 items-center justify-center py-4">
        {mode === "read" ? (
          <ReadingView
            node={currentNode}
            onTravel={travel}
            onExplore={() => setMode("explore")}
          />
        ) : (
          <GraphView
            node={currentNode}
            loadingSlug={loadingSlug}
            onTravel={travel}
            onRead={() => setMode("read")}
          />
        )}
      </div>
    </main>
  );
}
