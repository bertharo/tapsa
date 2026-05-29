/**
 * Canonical slug handling. A Tapsa slug is a lowercase, hyphenated form of a
 * Wikipedia page title. We keep a reversible-ish mapping: slug <-> title.
 *
 * Wikipedia titles use underscores and preserve case (e.g. "Black_hole").
 * Our slugs are URL-friendly: "black-hole".
 */

/** Convert a Wikipedia title (spaces or underscores) into a canonical slug. */
export function titleToSlug(title: string): string {
  return title
    .trim()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Best-effort conversion of a slug back into a Wikipedia-style title query. */
export function slugToTitleQuery(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

/** Normalize free-text user input into a canonical slug. */
export function normalizeInputToSlug(input: string): string {
  return titleToSlug(input);
}
