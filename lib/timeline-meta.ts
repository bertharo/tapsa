import { sanitizeWikiText } from "./timeline-text-hygiene";

const META_PREFIX =
  /^(timeline|list|history|outline|category|index|glossary|bibliography|chronology)\s+(of|for)\s+/i;

const META_EXACT =
  /^(timeline|list|history|outline|category|index|glossary|bibliography|chronology)$/i;

/** True when a title names a document/collection, not a historical occurrence. */
export function isMetaArticleTitle(title: string): boolean {
  const cleaned = sanitizeWikiText(title).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!cleaned) return true;
  if (META_EXACT.test(cleaned)) return true;
  if (META_PREFIX.test(cleaned)) return true;
  if (/^category:/i.test(cleaned)) return true;
  return false;
}

/** Meta-articles worth descending into for dated prose (not table timelines). */
export function shouldDescendMetaArticle(title: string): boolean {
  const cleaned = sanitizeWikiText(title).trim();
  return /^history of\s+/i.test(cleaned);
}

/** Pull a wiki article title from a list-line body (after the date prefix). */
export function extractLinkedTitleFromBody(body: string): string | null {
  const cleaned = sanitizeWikiText(body);
  if (!cleaned || cleaned.length < 4) return null;
  const firstClause = cleaned.split(/[.;]/)[0]?.trim() ?? cleaned;
  if (isMetaArticleTitle(firstClause)) return firstClause;
  return null;
}
