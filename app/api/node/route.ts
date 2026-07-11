import { NextRequest, NextResponse } from "next/server";
import { getOrCreateNode, TopicNotFoundError } from "@/lib/node-service";
import { getStore } from "@/lib/cache";
import { normalizeInputToSlug } from "@/lib/slug";
import { checkColdLimit, clientIp } from "@/lib/rate-limit";
import type { Domain } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("slug") ?? searchParams.get("q") ?? "";
  const domainParam = searchParams.get("domain");
  const slug = normalizeInputToSlug(raw);

  if (!slug) {
    return NextResponse.json({ error: "Missing topic." }, { status: 400 });
  }

  const store = getStore();
  const cached = await store.get(slug);

  // Cold generations are soft rate-limited per IP; cached reads stay unlimited.
  if (!cached) {
    const ip = clientIp(req.headers);
    const limit = checkColdLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many new explorations. Try a cached topic, or slow down a moment." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
        },
      );
    }
  }

  try {
    const domain =
      domainParam === "science" || domainParam === "history"
        ? (domainParam as Domain)
        : undefined;
    const { node, cacheHit } = await getOrCreateNode(slug, domain);
    return NextResponse.json(
      { node, cacheHit },
      {
        headers: {
          "x-tapsa-cache": cacheHit ? "hit" : "miss",
          "Cache-Control": cacheHit
            ? "public, s-maxage=86400, stale-while-revalidate=604800"
            : "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    if (err instanceof TopicNotFoundError) {
      return NextResponse.json(
        { error: `We couldn't find "${raw}" on Wikipedia. Try another phrasing.` },
        { status: 404 },
      );
    }
    console.error("[tapsa] /api/node error:", err);
    return NextResponse.json({ error: "Something went wrong generating that node." }, { status: 500 });
  }
}
