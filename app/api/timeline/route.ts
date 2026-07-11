import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTimeline, TopicNotFoundError } from "@/lib/timeline-service";
import { getTimelineStore } from "@/lib/timeline-cache";
import { normalizeInputToSlug } from "@/lib/slug";
import { checkColdLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("slug") ?? searchParams.get("q") ?? "";
  const slug = normalizeInputToSlug(raw);

  if (!slug) {
    return NextResponse.json({ error: "Missing topic." }, { status: 400 });
  }

  const cached = await getTimelineStore().get(slug);
  if (!cached) {
    const ip = clientIp(req.headers);
    const limit = checkColdLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many new timelines. Try again in a moment." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
        },
      );
    }
  }

  try {
    const { timeline, cacheHit } = await getOrCreateTimeline(raw || slug);
    return NextResponse.json(
      { timeline, cacheHit },
      { headers: { "x-tapsa-cache": cacheHit ? "hit" : "miss" } },
    );
  } catch (err) {
    if (err instanceof TopicNotFoundError) {
      return NextResponse.json(
        { error: `We couldn't find "${raw}" on Wikipedia. Try another phrasing.` },
        { status: 404 },
      );
    }
    console.error("[tapsa] /api/timeline error:", err);
    return NextResponse.json({ error: "Something went wrong generating that timeline." }, { status: 500 });
  }
}
