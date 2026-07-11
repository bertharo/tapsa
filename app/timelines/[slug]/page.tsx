import type { Metadata } from "next";
import TimelineExplorer from "@/components/timelines/TimelineExplorer";
import {
  getOrCreateTimeline,
} from "@/lib/timeline-service";
import {
  isTimelineTooThin,
  isTimelineUnavailable,
  isTopicNotFound,
} from "@/lib/timeline-errors";
import { getSiteUrl } from "@/lib/site";
import { slugToTitleQuery } from "@/lib/slug";
import Link from "next/link";
import TimelineSearch from "@/components/timelines/TimelineSearch";

type Params = { slug: string };

function prettify(slug: string): string {
  const s = slugToTitleQuery(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function TimelineErrorShell({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { timeline } = await getOrCreateTimeline(params.slug);
    const site = getSiteUrl();
    const canonical = `${site}/timelines/${encodeURIComponent(timeline.slug)}`;
    return {
      title: `${timeline.title} · Timelines`,
      description: `An interactive timeline of ${timeline.topic} — ${timeline.events.length} events from ${timeline.eras[0]?.name ?? "history"} to today.`,
      alternates: { canonical },
      openGraph: {
        title: `${timeline.title} · Tapsa Timelines`,
        description: `Travel through the history of ${timeline.topic}.`,
        url: canonical,
        type: "article",
      },
    };
  } catch {
    return { title: `${prettify(params.slug)} · Timelines` };
  }
}

export default async function TimelineTopicPage({ params }: { params: Params }) {
  let timeline;
  try {
    const result = await getOrCreateTimeline(params.slug);
    timeline = result.timeline;
  } catch (err) {
    if (isTimelineTooThin(err)) {
      return (
        <TimelineErrorShell
          title="Not enough history here yet."
          body="This topic doesn't have enough dated history for a timeline yet. Try a broader subject."
        />
      );
    }
    if (isTopicNotFound(err)) {
      return (
        <TimelineErrorShell
          title="That timeline went cold."
          body={`We couldn't find ${prettify(params.slug)} on Wikipedia. Try another phrasing.`}
        />
      );
    }
    if (isTimelineUnavailable(err)) {
      const body =
        err.reason === "rate_limit"
          ? "Timeline generation is briefly rate-limited. Please try again in a few minutes."
          : "Timeline generation isn't configured on this deployment yet.";
      return <TimelineErrorShell title="Timelines are taking a breather." body={body} />;
    }
    console.error("[timelines]", err);
    return (
      <TimelineErrorShell
        title="Something went wrong building this timeline."
        body="Please try again in a moment, or search for a different topic."
      />
    );
  }

  return <TimelineExplorer timeline={timeline} />;
}
