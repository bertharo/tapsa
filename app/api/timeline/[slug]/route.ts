import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTimeline } from "@/lib/timeline-service";
import {
  isTimelineTooThin,
  isTimelineUnavailable,
  isTopicNotFound,
} from "@/lib/timeline-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { slug: string };

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const result = await getOrCreateTimeline(params.slug);
    return NextResponse.json({ timeline: result.timeline, cacheHit: result.cacheHit });
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
    console.error("[api/timeline]", err);
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
