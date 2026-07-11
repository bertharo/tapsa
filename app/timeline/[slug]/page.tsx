import type { Metadata } from "next";
import { Suspense } from "react";
import TimelineSlugClient from "@/components/timelines/TimelineSlugClient";
import TimelineGeneratingShell from "@/components/timelines/TimelineGeneratingShell";
import { peekTimeline } from "@/lib/timeline-service";
import { getSiteUrl } from "@/lib/site";
import { slugToTitleQuery } from "@/lib/slug";

type Params = { slug: string };
type Search = { q?: string };

function prettify(slug: string): string {
  const s = slugToTitleQuery(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: Search;
}): Promise<Metadata> {
  const query = searchParams?.q?.trim() || slugToTitleQuery(params.slug);
  const fallbackTitle = prettify(params.slug);
  const site = getSiteUrl();
  const canonical = `${site}/timeline/${encodeURIComponent(params.slug)}`;

  let title = fallbackTitle;
  let description = `Travel through the history of ${fallbackTitle} — an interactive timeline from Wikipedia.`;

  const peeked = await peekTimeline(query);
  if (peeked) {
    title = peeked.title;
    description = peeked.orientation;
  }

  const ogUrl = `${site}/api/og?timeline=${encodeURIComponent(params.slug)}&q=${encodeURIComponent(query)}`;

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
      images: [{ url: ogUrl, width: 1200, height: 630, alt: `${title} timeline` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Tapsa Timelines`,
      description,
      images: [ogUrl],
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
