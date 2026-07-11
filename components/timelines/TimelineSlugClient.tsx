"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TimelineExplorer from "./TimelineExplorer";
import TimelineSearch from "./TimelineSearch";
import type { TapsaTimeline } from "@/lib/timeline-types";
import { slugToTitleQuery } from "@/lib/slug";

function displayQuery(q: string): string {
  const s = q.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function TimelineErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <h1 className="font-serif text-3xl font-medium text-ink">{title}</h1>
      <p className="mt-3 text-ink-muted">{body}</p>
      <div className="mt-6 w-full">
        <TimelineSearch />
      </div>
      <Link href="/timelines" className="mt-6 text-sm text-ink-faint hover:text-ink-muted">
        ← All timelines
      </Link>
    </main>
  );
}

function TimelineGeneratingShell({ title }: { title: string }) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-paper">
      <header className="shrink-0 border-b border-ink/5 bg-paper px-4 py-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            Tapsa Timelines
          </p>
          <h1 className="font-timeline-serif mt-1 text-2xl font-medium text-ink md:text-3xl">
            {title}
          </h1>
        </div>
      </header>

      <div className="night-sky relative flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <div className="night-stars night-stars-1 pointer-events-none absolute inset-0" />
        <div className="night-stars night-stars-2 pointer-events-none absolute inset-0" />
        <div className="relative z-10 max-w-sm text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-pulse rounded-full border-2 border-white/20 bg-white/10" />
          <p className="font-timeline-serif text-lg text-white/90">Building your timeline…</p>
          <p className="mt-2 text-sm text-white/50">
            Extracting dated events from Wikipedia. First visit can take up to a minute.
          </p>
        </div>
      </div>
    </div>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; timeline: TapsaTimeline }
  | { status: "not_found" }
  | { status: "too_thin" }
  | { status: "unavailable"; reason?: string }
  | { status: "error" };

export default function TimelineSlugClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() || slugToTitleQuery(slug);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const displayTitle = displayQuery(query);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const apiUrl = `/api/timeline/${encodeURIComponent(slug)}?q=${encodeURIComponent(query)}`;
        const res = await fetch(apiUrl, { cache: "no-store" });
        const data = (await res.json()) as {
          timeline?: TapsaTimeline;
          error?: string;
          reason?: string;
        };
        if (cancelled) return;

        if (res.ok && data.timeline) {
          setState({ status: "ready", timeline: data.timeline });
          return;
        }
        if (data.error === "not_found") setState({ status: "not_found" });
        else if (data.error === "too_thin") setState({ status: "too_thin" });
        else if (data.error === "unavailable") {
          setState({ status: "unavailable", reason: data.reason });
        } else setState({ status: "error" });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, query]);

  if (state.status === "loading") {
    return <TimelineGeneratingShell title={displayTitle} />;
  }
  if (state.status === "ready") {
    return <TimelineExplorer timeline={state.timeline} />;
  }
  if (state.status === "not_found") {
    return (
      <TimelineErrorShell
        title="That timeline went cold."
        body={`We couldn't find ${displayTitle} on Wikipedia. Try another phrasing.`}
      />
    );
  }
  if (state.status === "too_thin") {
    return (
      <TimelineErrorShell
        title="Not enough history here yet."
        body="This topic doesn't have enough dated history for a timeline yet. Try a broader subject."
      />
    );
  }
  if (state.status === "unavailable") {
    const body =
      state.reason === "rate_limit"
        ? "Timeline generation is briefly rate-limited. Please try again in a few minutes."
        : "Timeline generation isn't configured on this deployment yet.";
    return <TimelineErrorShell title="Timelines are taking a breather." body={body} />;
  }
  return (
    <TimelineErrorShell
      title="Something went wrong building this timeline."
      body="Please try again in a moment, or search for a different topic."
    />
  );
}
