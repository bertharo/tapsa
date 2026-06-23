import type { Metadata } from "next";
import Link from "next/link";
import Explorer from "@/components/Explorer";
import SearchField from "@/components/SearchField";
import { getOrCreateNode, peekNode, TopicNotFoundError } from "@/lib/node-service";
import { decodeTrail } from "@/lib/trail";
import { slugToTitleQuery } from "@/lib/slug";
import { getSiteUrl } from "@/lib/site";
import type { Crumb } from "@/components/Breadcrumb";

type Params = { slug: string };
type Search = { trail?: string; from?: string };

function prettify(slug: string): string {
  const s = slugToTitleQuery(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  try {
    const { node } = await getOrCreateNode(params.slug);
    const site = getSiteUrl();
    const canonical = `${site}/topic/${encodeURIComponent(node.slug)}`;

    // Shared connection card: preview Anchor — [relationship] — Target.
    const from = typeof searchParams.from === "string" ? searchParams.from : undefined;
    if (from) {
      const anchor = await peekNode(from);
      const conn = anchor?.connections.find((c) => c.slug === node.slug);
      if (anchor && conn) {
        const rel = conn.relationship ?? "connects to";
        const title = `${anchor.title} ${rel} ${node.title}`;
        const ogUrl = `${site}/api/og?anchor=${encodeURIComponent(anchor.slug)}&target=${encodeURIComponent(node.slug)}`;
        return {
          title,
          description: conn.rationale,
          alternates: { canonical },
          openGraph: {
            title: `${title} · Tapsa`,
            description: conn.rationale,
            url: canonical,
            images: [{ url: ogUrl, width: 1200, height: 630 }],
            type: "article",
          },
          twitter: {
            card: "summary_large_image",
            title: `${title} · Tapsa`,
            description: conn.rationale,
            images: [ogUrl],
          },
        };
      }
    }

    const ogUrl = `${site}/api/og?slug=${encodeURIComponent(node.slug)}`;
    return {
      title: node.title,
      description: node.summary,
      alternates: { canonical },
      openGraph: {
        title: `${node.title} · Tapsa`,
        description: node.summary,
        url: canonical,
        images: [{ url: ogUrl, width: 1200, height: 630 }],
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: `${node.title} · Tapsa`,
        description: node.summary,
        images: [ogUrl],
      },
    };
  } catch {
    return { title: prettify(params.slug) };
  }
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  let node;
  try {
    const result = await getOrCreateNode(params.slug);
    node = result.node;
  } catch (err) {
    if (err instanceof TopicNotFoundError) return <NotFound query={params.slug} />;
    throw err;
  }

  // Reconstruct the trail from the URL, ending on the canonical current node.
  const trailSlugs = decodeTrail(searchParams.trail);
  let slugs = trailSlugs.length ? trailSlugs : [node.slug];
  if (slugs[slugs.length - 1] !== node.slug) slugs = [...slugs, node.slug];

  const crumbs: Crumb[] = await Promise.all(
    slugs.map(async (s): Promise<Crumb> => {
      if (s === node!.slug) return { slug: node!.slug, title: node!.title };
      const cached = await peekNode(s);
      return { slug: s, title: cached?.title ?? prettify(s) };
    }),
  );

  return <Explorer initialNode={node} initialCrumbs={crumbs} />;
}

function NotFound({ query }: { query: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <h1 className="font-serif text-3xl font-medium text-ink">
        That trail went cold.
      </h1>
      <p className="mt-3 text-ink-muted">
        We couldn&rsquo;t find <span className="font-medium text-ink">{prettify(query)}</span>{" "}
        on Wikipedia. Try another phrasing.
      </p>
      <div className="mt-6 w-full">
        <SearchField />
      </div>
      <Link href="/" className="mt-6 text-sm text-ink-faint hover:text-ink-muted">
        ← Back home
      </Link>
    </main>
  );
}
