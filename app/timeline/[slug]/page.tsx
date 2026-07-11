import type { Metadata } from "next";
import { Suspense } from "react";
import TimelineSlugClient from "@/components/timelines/TimelineSlugClient";
import TimelineGeneratingShell from "@/components/timelines/TimelineGeneratingShell";
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
  const canonical = `${site}/timeline/${encodeURIComponent(params.slug)}`;
  const description = `Travel through the history of ${title} — an interactive timeline from Wikipedia.`;

  return {
    title: `${title} · Timelines`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} · Tapsa Timelines`,
      description,
      url: canonical,
      type: "article",
      siteName: "Tapsa",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Tapsa Timelines`,
      description,
    },
  };
}

export default function TimelineTopicPage({ params }: { params: Params }) {
  const title = prettify(params.slug);

  return (
    <Suspense fallback={<TimelineGeneratingShell title={title} />}>
      <TimelineSlugClient slug={params.slug} />
    </Suspense>
  );
}
