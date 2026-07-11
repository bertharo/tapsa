import { NextRequest, NextResponse } from "next/server";
import { resolveTimelineShell } from "@/lib/timeline-service";
import {
  isTimelineTooThin,
  isTimelineUnavailable,
  isTopicNotFound,
} from "@/lib/timeline-errors";
import { getDisambiguationOptions } from "@/lib/timeline-resolve";
import { slugToTitleQuery } from "@/lib/slug";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { slug: string };

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const q = req.nextUrl.searchParams.get("q");
  const topic = (q?.trim() || slugToTitleQuery(params.slug)).trim();
  if (!topic) {
    return NextResponse.json({ error: "missing_topic" }, { status: 400 });
  }

  try {
    const options = await getDisambiguationOptions(topic);
    if (options) {
      return NextResponse.json({ disambiguation: true, options });
    }

    const result = await resolveTimelineShell(topic);
    return NextResponse.json({ shell: result.shell, cacheHit: result.cacheHit });
  } catch (err) {
    if (isTopicNotFound(err)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (isTimelineTooThin(err)) {
      return NextResponse.json({ error: "too_thin" }, { status: 422 });
    }
    if (isTimelineUnavailable(err)) {
      return NextResponse.json(
        { error: "unavailable", reason: err.reason },
        { status: 503 },
      );
    }
    console.error("[api/timeline/shell]", err);
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
