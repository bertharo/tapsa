import { NextRequest, NextResponse } from "next/server";
import { autocomplete } from "@/lib/wikipedia";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    const results = await autocomplete(q);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (err) {
    console.error("[tapsa] autocomplete error:", err);
    return NextResponse.json({ results: [] });
  }
}
