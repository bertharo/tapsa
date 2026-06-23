import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { peekNode } from "@/lib/node-service";
import { slugToTitleQuery } from "@/lib/slug";

export const runtime = "nodejs";

const PAPER = "#fbfbfa";
const INK = "#0a0a0b";
const MUTED = "#6b6b76";
const ACCENT = "#c9612f";

function prettify(slug: string): string {
  const s = slugToTitleQuery(slug);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Connection-card preview: Anchor — [relationship] — Target + the sentence.
  const anchorSlug = searchParams.get("anchor");
  const targetSlug = searchParams.get("target");
  if (anchorSlug && targetSlug) {
    const anchor = await peekNode(anchorSlug);
    const conn = anchor?.connections.find((c) => c.slug === targetSlug);
    if (anchor && conn) {
      const rel = conn.relationship ?? "connects to";
      const big = Math.max(anchor.title.length, conn.title.length) > 22 ? 56 : 72;
      return new ImageResponse(
        (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              backgroundColor: PAPER,
              padding: "64px 72px",
              fontFamily: "serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 14, height: 14, borderRadius: 9999, backgroundColor: ACCENT, display: "flex" }} />
              <div style={{ fontSize: 28, color: MUTED, letterSpacing: 1 }}>Tapsa</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: big, fontWeight: 600, color: INK, lineHeight: 1.05, letterSpacing: -1 }}>
                {anchor.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 30, color: MUTED }}>—</div>
                <div style={{ fontSize: 30, color: ACCENT }}>{rel}</div>
                <div style={{ fontSize: 30, color: MUTED }}>—</div>
              </div>
              <div style={{ fontSize: big, fontWeight: 600, color: INK, lineHeight: 1.05, letterSpacing: -1 }}>
                {conn.title}
              </div>
              <div style={{ marginTop: 24, fontSize: 28, color: MUTED, lineHeight: 1.4, maxWidth: 980 }}>
                {conn.rationale.length > 160 ? `${conn.rationale.slice(0, 157)}…` : conn.rationale}
              </div>
            </div>

            <div style={{ fontSize: 24, color: MUTED }}>tapsa.ai</div>
          </div>
        ),
        { width: 1200, height: 630 },
      );
    }
  }

  const slug = searchParams.get("slug") ?? "";
  const node = slug ? await peekNode(slug) : null;

  const title = node?.title ?? (slug ? prettify(slug) : "Tapsa");
  const summary =
    node?.summary ??
    "A navigable map of ideas in science and history.";
  const connections = node?.connections.slice(0, 4) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: PAPER,
          padding: "64px 72px",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 9999,
              backgroundColor: ACCENT,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 28, color: MUTED, letterSpacing: 1 }}>Tapsa</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: title.length > 28 ? 64 : 84,
              fontWeight: 600,
              color: INK,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 30,
              color: MUTED,
              lineHeight: 1.4,
              maxWidth: 980,
            }}
          >
            {summary.length > 180 ? `${summary.slice(0, 177)}…` : summary}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {connections.map((c) => (
            <div
              key={c.slug}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 24,
                padding: "10px 20px",
                borderRadius: 9999,
                color: c.surprising ? ACCENT : INK,
                border: `2px solid ${c.surprising ? ACCENT : "rgba(10,10,11,0.12)"}`,
                backgroundColor: c.surprising ? "rgba(201,97,47,0.06)" : "white",
              }}
            >
              {c.surprising && (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 9999,
                    backgroundColor: ACCENT,
                    display: "flex",
                  }}
                />
              )}
              {c.title}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
