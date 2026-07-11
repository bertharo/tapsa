import type { Metadata } from "next";
import TimelineExplorer from "@/components/timelines/TimelineExplorer";
import { getOrCreateTimeline, TopicNotFoundError } from "@/lib/timeline-service";
import { getSiteUrl } from "@/lib/site";
import { slugToTitleQuery } from "@/lib/slug";
import Link from "next/link";
import TimelineSearch from "@/components/timelines/TimelineSearch";

type Params = { slug: string };

function prettify(slug: string): string {
  const s = slugToTitleQuery(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    if (err instanceof TopicNotFoundError) {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 text-center">
          <h1 className="font-serif text-3xl font-medium text-ink">That timeline went cold.</h1>
          <p className="mt-3 text-ink-muted">
            We couldn&rsquo;t find <span className="font-medium text-ink">{prettify(params.slug)}</span>{" "}
            on Wikipedia. Try another phrasing.
          </p>
          <div className="mt-6 w-full">
            <TimelineSearch />
          </div>
          <Link href="/timelines" className="mt-6 text-sm text-ink-faint hover:text-ink-muted">
            ← All timelines
          </Link>
        </main>
      );
    }
    throw err;
  }

  return <TimelineExplorer timeline={timeline} />;
}
