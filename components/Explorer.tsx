"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Connection, TapsaNode } from "@/lib/types";
import GraphView from "./GraphView";
import ReadingView from "./ReadingView";
import Breadcrumb, { type Crumb } from "./Breadcrumb";
import { buildShareUrl } from "@/lib/trail";
import { getNodeClientCache } from "@/lib/node-client-cache";
import { shellNodeFromConnection } from "@/lib/node-shell";
import { markNodeClick, markNodeFirstPaint, markNodeHydrated } from "@/lib/node-perf";
import { isNodeWarmed, markNodeWarmed, prefetchNode } from "@/lib/node-prefetch";

type FetchState = { node?: TapsaNode; error?: string };
type ViewMode = "read" | "explore";

const nodeCache = getNodeClientCache();
const inflightFetches = new Map<string, Promise<FetchState>>();

async function fetchNode(slug: string): Promise<FetchState> {
  const existing = inflightFetches.get(slug);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/node?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) return { error: data?.error ?? "Could not load that topic." };
      return { node: data.node as TapsaNode };
    } catch {
      return { error: "Network hiccup. Try again." };
    }
  })();

  inflightFetches.set(slug, promise);
  try {
    return await promise;
  } finally {
    inflightFetches.delete(slug);
  }
}

export default function Explorer({
  initialNode,
  initialCrumbs,
}: {
  initialNode: TapsaNode;
  initialCrumbs: Crumb[];
}) {
  nodeCache.seed(initialNode);

  const travelGeneration = useRef(0);
  const [crumbs, setCrumbs] = useState<Crumb[]>(
    initialCrumbs.length ? initialCrumbs : [{ slug: initialNode.slug, title: initialNode.title }],
  );
  const [currentIndex, setCurrentIndex] = useState(
    (initialCrumbs.length || 1) - 1,
  );
  const [currentNode, setCurrentNode] = useState<TapsaNode>(initialNode);
  const [hydratingSlug, setHydratingSlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<ViewMode>("read");

  const syncUrl = useCallback((slug: string, trailSlugs: string[]) => {
    if (typeof window === "undefined") return;
    const url = buildShareUrl(window.location.origin, slug, trailSlugs);
    window.history.replaceState(null, "", url.replace(window.location.origin, ""));
  }, []);

  const pushTravel = useCallback(
    (node: TapsaNode) => {
      setCrumbs((prev) => {
        const trimmed = prev.slice(0, currentIndex + 1);
        const next = [...trimmed, { slug: node.slug, title: node.title }];
        syncUrl(node.slug, next.map((c) => c.slug));
        return next;
      });
      setCurrentIndex((i) => i + 1);
      setCurrentNode(node);
      setMode("read");
    },
    [currentIndex, syncUrl],
  );

  const hydrateTravel = useCallback(
    (conn: Connection, node: TapsaNode, source: string, gen: number) => {
      if (gen !== travelGeneration.current) return;
      nodeCache.set(node);
      markNodeWarmed(node.slug);
      setCurrentNode(node);
      setCrumbs((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && (last.slug === conn.slug || last.slug === node.slug)) {
          next[next.length - 1] = { slug: node.slug, title: node.title };
        }
        syncUrl(node.slug, next.map((c) => c.slug));
        return next;
      });
      setHydratingSlug(null);
      setLoadingSlug(null);
      markNodeHydrated(conn.slug, source);
    },
    [syncUrl],
  );

  const travel = useCallback(
    async (conn: Connection) => {
      const gen = ++travelGeneration.current;
      markNodeClick(conn.slug);
      setError(null);

      const cached = nodeCache.getSync(conn.slug);
      if (cached) {
        markNodeFirstPaint(conn.slug);
        pushTravel(cached);
        markNodeHydrated(conn.slug, "memory");
        return;
      }

      setHydratingSlug(conn.slug);
      setLoadingSlug(conn.slug);
      pushTravel(shellNodeFromConnection(conn));
      markNodeFirstPaint(conn.slug);

      const idb = await nodeCache.get(conn.slug);
      if (idb) {
        hydrateTravel(conn, idb, "indexeddb", gen);
        return;
      }

      const prefetched = nodeCache.getSync(conn.slug);
      if (prefetched) {
        hydrateTravel(conn, prefetched, "prefetch", gen);
        return;
      }

      const result = await fetchNode(conn.slug);
      if (gen !== travelGeneration.current) return;
      if (result.error || !result.node) {
        setError(result.error ?? "Could not load that topic.");
        setHydratingSlug(null);
        setLoadingSlug(null);
        return;
      }
      hydrateTravel(conn, result.node, "network", gen);
    },
    [hydrateTravel, pushTravel],
  );

  const warmNode = useCallback(async (slug: string) => {
    if (nodeCache.getSync(slug) || isNodeWarmed(slug)) {
      markNodeWarmed(slug);
      return;
    }
    const idb = await nodeCache.get(slug);
    if (idb) {
      markNodeWarmed(slug);
      return;
    }
    const result = await fetchNode(slug);
    if (result.node) {
      nodeCache.set(result.node);
      markNodeWarmed(slug);
    }
  }, []);

  const prefetchConnection = useCallback(
    (slug: string) => {
      prefetchNode(slug, warmNode);
    },
    [warmNode],
  );

  useEffect(() => {
    for (const conn of currentNode.connections) {
      prefetchConnection(conn.slug);
    }
  }, [currentNode.slug, currentNode.connections, prefetchConnection]);

  const jump = useCallback(
    async (index: number) => {
      if (index === currentIndex || loadingSlug) return;
      const target = crumbs[index];
      if (!target) return;
      setError(null);
      const gen = ++travelGeneration.current;

      let node: TapsaNode | null = nodeCache.getSync(target.slug);
      if (!node) {
        setLoadingSlug(target.slug);
        setHydratingSlug(target.slug);
        node = await nodeCache.get(target.slug);
      }
      if (!node) {
        const result = await fetchNode(target.slug);
        if (gen !== travelGeneration.current) return;
        if (result.error || !result.node) {
          setError(result.error ?? "Could not reload that node.");
          setLoadingSlug(null);
          setHydratingSlug(null);
          return;
        }
        node = result.node;
        nodeCache.set(node);
      }

      if (gen !== travelGeneration.current) return;
      setCurrentIndex(index);
      setCurrentNode(node);
      setMode("read");
      setLoadingSlug(null);
      setHydratingSlug(null);
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
  const isHydrating = hydratingSlug === currentNode.slug;

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
          <Link
            href="/"
            className="hidden rounded-full border border-ink/10 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink sm:inline"
          >
            Timelines
          </Link>
          <span className="hidden text-xs text-ink-faint md:inline">
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
            hydrating={isHydrating}
            onTravel={travel}
            onExplore={() => setMode("explore")}
            onPrefetch={prefetchConnection}
          />
        ) : (
          <GraphView
            node={currentNode}
            loadingSlug={loadingSlug}
            onTravel={travel}
            onRead={() => setMode("read")}
            onPrefetch={prefetchConnection}
          />
        )}
      </div>
    </main>
  );
}
