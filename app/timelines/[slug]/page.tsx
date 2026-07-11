import type { Metadata } from "next";
import { Suspense } from "react";
import TimelineSlugClient from "@/components/timelines/TimelineSlugClient";
import { getSiteUrl } from "@/lib/site";
import { slugToTitleQuery } from "@/lib/slug";

type Params = { slug: string };

function prettify(slug: string): string {
  const s = slugToTitleQuery(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const title = prettify(params.slug);
  const site = getSiteUrl();
  const canonical = `${site}/timelines/${encodeURIComponent(params.slug)}`;
  return {
    title: `${title} · Timelines`,
    description: `An interactive timeline of ${title}.`,
    alternates: { canonical },
    openGraph: {
      title: `${title} · Tapsa Timelines`,
      description: `Travel through the history of ${title}.`,
      url: canonical,
      type: "article",
    },
  };
}

export default function TimelineTopicPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center bg-paper">
          <p className="text-sm text-ink-muted">Loading timeline…</p>
        </div>
      }
    >
      <TimelineSlugClient slug={params.slug} />
    </Suspense>
  );
}
