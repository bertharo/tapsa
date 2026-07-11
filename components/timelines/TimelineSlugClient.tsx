"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clearTimelineBuilding, markTimelineBuilding } from "@/lib/timeline-nav";
import TimelineExplorer from "./TimelineExplorer";
import TimelineSearch from "./TimelineSearch";
import TimelineGeneratingShell from "./TimelineGeneratingShell";
import type { TapsaTimeline, TimelineShell } from "@/lib/timeline-types";
import { TIMELINE_SCHEMA_VERSION } from "@/lib/timeline-types";
import { slugToTitleQuery } from "@/lib/slug";

function displayQuery(q: string): string {
  const s = q.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function timelineCacheKey(slug: string, query: string): string {
  return `tapsa:timeline:v${TIMELINE_SCHEMA_VERSION}:${slug}:${query.trim().toLowerCase()}`;
}

function readLocalTimeline(slug: string, query: string): TapsaTimeline | null {
  try {
    const raw = localStorage.getItem(timelineCacheKey(slug, query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TapsaTimeline;
    if (parsed?.schemaVersion !== TIMELINE_SCHEMA_VERSION) return null;
    if (parsed?.events?.length && parsed.slug) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocalTimeline(slug: string, query: string, timeline: TapsaTimeline) {
  try {
    localStorage.setItem(timelineCacheKey(slug, query), JSON.stringify(timeline));
  } catch {
    /* quota */
  }
}

function shellToPartialTimeline(shell: TimelineShell): TapsaTimeline {
  return {
    slug: shell.slug,
    title: shell.title,
    topic: shell.topic,
    wikiTitle: shell.wikiTitle,
    revisionId: shell.revisionId,
    sourceUrl: shell.sourceUrl,
    orientation: shell.orientation,
    eras: shell.eras,
    topicType: shell.topicType,
    sparse: shell.sparse,
    schemaVersion: shell.schemaVersion,
    events: [],
    generatedAt: new Date().toISOString(),
    cacheKey: "",
    origin: "wikipedia",
  };
}

function TimelineErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <h1 className="font-serif text-3xl font-medium text-ink">{title}</h1>
      <p className="mt-3 text-ink-muted">{body}</p>
      <div className="mt-6 w-full">
        <TimelineSearch />
      </div>
      <Link href="/" className="mt-6 text-sm text-ink-faint hover:text-ink-muted">
        ← Home
      </Link>
    </main>
  );
}

type DisambiguationOption = { title: string; slug: string };

type LoadState =
  | { status: "loading" }
  | { status: "partial"; timeline: TapsaTimeline; loadingEras: Set<string> }
  | { status: "ready"; timeline: TapsaTimeline }
  | { status: "disambiguation"; options: DisambiguationOption[]; query: string }
  | { status: "not_found" }
  | { status: "too_thin" }
  | { status: "unavailable"; reason?: string }
  | { status: "error"; partial?: TapsaTimeline };

function DisambiguationPicker({
  query,
  options,
}: {
  query: string;
  options: DisambiguationOption[];
}) {
  const router = useRouter();
  const display = displayQuery(query);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
        Tapsa Timelines
      </p>
      <h1 className="font-timeline-serif mt-2 text-3xl font-medium text-ink">
        Did you mean…
      </h1>
      <p className="mt-3 text-ink-muted">
        &ldquo;{display}&rdquo; could refer to several topics. Pick one to build its timeline.
      </p>
      <div className="mt-8 flex w-full flex-wrap justify-center gap-2">
        {options.map((opt) => (
          <button
            key={opt.slug}
            type="button"
            onClick={() => {
              markTimelineBuilding(opt.title);
              router.push(
                `/timeline/${encodeURIComponent(opt.slug)}?q=${encodeURIComponent(opt.title)}`,
              );
            }}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink"
          >
            {opt.title}
          </button>
        ))}
      </div>
      <div className="mt-10 w-full">
        <TimelineSearch />
      </div>
    </main>
  );
}

export default function TimelineSlugClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() || slugToTitleQuery(slug);
  const [state, setState] = useState<LoadState>(() => {
    if (typeof window === "undefined") return { status: "loading" };
    const cached = readLocalTimeline(slug, query);
    return cached ? { status: "ready", timeline: cached } : { status: "loading" };
  });
  const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const displayTitle = displayQuery(query);

  const loadFullTimeline = useCallback(async () => {
    const apiUrl = `/api/timeline/${encodeURIComponent(slug)}?q=${encodeURIComponent(query)}`;
    const res = await fetch(apiUrl, { cache: "no-store" });
    const data = (await res.json()) as {
      timeline?: TapsaTimeline;
      disambiguation?: boolean;
      options?: DisambiguationOption[];
      error?: string;
      reason?: string;
    };
    return { res, data };
  }, [slug, query]);

  useEffect(() => {
    if (state.status !== "loading") {
      clearTimelineBuilding();
    }
  }, [state.status]);

  useEffect(() => {
    let cancelled = false;
    const cached = readLocalTimeline(slug, query);

    if (cached) {
      setState({ status: "ready", timeline: cached });
      setEventsLoadError(null);
      (async () => {
        try {
          const { res, data } = await loadFullTimeline();
          if (cancelled) return;
          if (res.ok && data.timeline) {
            writeLocalTimeline(slug, query, data.timeline);
            setState({ status: "ready", timeline: data.timeline });
          }
        } catch {
          /* keep cached view */
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setState({ status: "loading" });
    setEventsLoadError(null);

    (async () => {
      try {
        const shellUrl = `/api/timeline/${encodeURIComponent(slug)}/shell?q=${encodeURIComponent(query)}`;
        const shellRes = await fetch(shellUrl, { cache: "no-store" });
        const shellData = (await shellRes.json()) as {
          shell?: TimelineShell;
          disambiguation?: boolean;
          options?: DisambiguationOption[];
          error?: string;
        };
        if (cancelled) return;

        if (shellData.disambiguation && shellData.options?.length) {
          setState({ status: "disambiguation", options: shellData.options, query });
          return;
        }
        if (shellData.error === "not_found") {
          setState({ status: "not_found" });
          return;
        }
        if (shellData.error === "too_thin") {
          setState({ status: "too_thin" });
          return;
        }

        if (shellRes.ok && shellData.shell) {
          const loadingEras = new Set(shellData.shell.eras.map((e) => e.id));
          setState({
            status: "partial",
            timeline: shellToPartialTimeline(shellData.shell),
            loadingEras,
          });
        }

        const { res, data } = await loadFullTimeline();
        if (cancelled) return;

        if (data.disambiguation && data.options?.length) {
          setState({ status: "disambiguation", options: data.options, query });
          return;
        }
        if (res.ok && data.timeline) {
          writeLocalTimeline(slug, query, data.timeline);
          setState({ status: "ready", timeline: data.timeline });
          setEventsLoadError(null);
          return;
        }
        if (data.error === "not_found") setState({ status: "not_found" });
        else if (data.error === "too_thin") setState({ status: "too_thin" });
        else if (data.error === "unavailable") {
          setState({ status: "unavailable", reason: data.reason });
        } else if (shellRes.ok && shellData.shell) {
          setEventsLoadError("Couldn't load events for this timeline.");
          setState((prev) =>
            prev.status === "partial"
              ? prev
              : { status: "error", partial: shellToPartialTimeline(shellData.shell!) },
          );
        } else {
          setState({ status: "error" });
        }
      } catch {
        if (!cancelled) {
          setEventsLoadError("Couldn't load events for this timeline.");
          setState((prev) => (prev.status === "partial" ? prev : { status: "error" }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, query, loadFullTimeline, retryKey]);

  const handleRetryEvents = useCallback(() => {
    setEventsLoadError(null);
    setRetryKey((k) => k + 1);
  }, []);

  if (state.status === "loading") {
    return <TimelineGeneratingShell title={displayTitle} />;
  }
  if (state.status === "partial" || state.status === "ready") {
    return (
      <TimelineExplorer
        timeline={state.timeline}
        loadingEras={state.status === "partial" ? state.loadingEras : undefined}
        eventsLoadError={eventsLoadError}
        onRetryEvents={eventsLoadError ? handleRetryEvents : undefined}
      />
    );
  }
  if (state.status === "error" && state.partial) {
    return (
      <TimelineExplorer
        timeline={state.partial}
        loadingEras={new Set(state.partial.eras.map((e) => e.id))}
        eventsLoadError={eventsLoadError ?? "Couldn't load events for this timeline."}
        onRetryEvents={handleRetryEvents}
      />
    );
  }
  if (state.status === "disambiguation") {
    return <DisambiguationPicker query={state.query} options={state.options} />;
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
