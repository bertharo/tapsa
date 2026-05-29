/**
 * Canonical slug handling. A Tapsa slug is a lowercase, hyphenated form of a
 * Wikipedia page title. We keep a reversible-ish mapping: slug <-> title.
 *
 * Wikipedia titles use underscores and preserve case (e.g. "Black_hole").
 * Our slugs are URL-friendly: "black-hole".
 */

/**
 * The reserved delimiter between a parent article slug and a section slug.
 * "~" is URL-safe (unreserved per RFC 3986), survives our normalization, and
 * doesn't appear in Wikipedia-derived slugs.
 */
export const SECTION_DELIMITER = "~";

/** Convert a Wikipedia title (spaces or underscores) into a canonical slug. */
export function titleToSlug(title: string): string {
  return title
    .trim()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s~-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build a section node slug from its parent and the section's title. */
export function makeSectionSlug(parentSlug: string, sectionTitle: string): string {
  return `${parentSlug}${SECTION_DELIMITER}${titleToSlug(sectionTitle)}`;
}

/** Split a section slug into its parts, or null if it isn't a section slug. */
export function parseSectionSlug(
  slug: string,
): { parentSlug: string; sectionSlug: string } | null {
  const idx = slug.indexOf(SECTION_DELIMITER);
  if (idx === -1) return null;
  const parentSlug = slug.slice(0, idx);
  const sectionSlug = slug.slice(idx + SECTION_DELIMITER.length);
  if (!parentSlug || !sectionSlug) return null;
  return { parentSlug, sectionSlug };
}

/** Best-effort conversion of a slug back into a Wikipedia-style title query. */
export function slugToTitleQuery(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

/** Normalize free-text user input into a canonical slug. */
export function normalizeInputToSlug(input: string): string {
  return titleToSlug(input);
}
