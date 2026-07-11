import TimelineGeneratingShell from "@/components/timelines/TimelineGeneratingShell";
import { slugToTitleQuery } from "@/lib/slug";

type Params = { slug: string };

export default function TimelineLoading({ params }: { params: Params }) {
  const title = slugToTitleQuery(params.slug);
  const display = title.charAt(0).toUpperCase() + title.slice(1);
  return <TimelineGeneratingShell title={display} />;
}
