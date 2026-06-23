/**
 * A trail is the ordered path of slugs a user has travelled. We encode it in the
 * URL so any map state is a shareable, reconstructable artifact.
 *
 * Encoding: comma-separated slugs in the `trail` query param. Slugs are already
 * URL-safe (lowercase, hyphenated), so this stays human-readable.
 */

const PARAM = "trail";
const MAX_TRAIL = 40; // guard against pathological URLs

export function encodeTrail(slugs: string[]): string {
  return slugs.filter(Boolean).slice(-MAX_TRAIL).join(",");
}

export function decodeTrail(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-MAX_TRAIL);
}

/** Build the canonical share URL for a trail ending on `currentSlug`. */
export function buildShareUrl(
  origin: string,
  currentSlug: string,
  trail: string[],
): string {
  const url = new URL(`/topic/${currentSlug}`, origin);
  // Only attach the trail when there's actual history to reconstruct.
  if (trail.length > 1) {
    url.searchParams.set(PARAM, encodeTrail(trail));
  }
  return url.toString();
}

export const TRAIL_PARAM = PARAM;

/**
 * Share URL for a revealed connection. Lands the visitor on the target topic,
 * and the `from` anchor lets the target page render the connection-card OG image
 * (Anchor — [relationship] — Target) as the link preview.
 */
export function buildConnectionShareUrl(
  origin: string,
  anchorSlug: string,
  targetSlug: string,
): string {
  const url = new URL(`/topic/${targetSlug}`, origin);
  url.searchParams.set("from", anchorSlug);
  return url.toString();
}
