import { redirect } from "next/navigation";

type Params = { slug: string; searchParams?: { q?: string } };

export default function TimelinesSlugLegacyRedirect({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: { q?: string };
}) {
  const q = searchParams?.q;
  const dest = q
    ? `/timeline/${encodeURIComponent(params.slug)}?q=${encodeURIComponent(q)}`
    : `/timeline/${encodeURIComponent(params.slug)}`;
  redirect(dest);
}
