/** Strip Wikipedia artifacts from titles and extracts before processing. */

const CITATION = /\[\d+\]/g;
const PRONUNCIATION = /\s*\([^)]*\/[^)]*\)/g;
const EMPTY_PARENS = /\(\s*\)/g;
const NESTED_EMPTY_PARENS = /\(\s*\(\s*\)\s*\)/g;
const WIKI_TEMPLATE = /\{\{[^{}]*\}\}/g;
const MULTI_TEMPLATE = /\{\{[\s\S]*?\}\}/g;
const WIKI_EDIT = /\s*\[?\s*edit\s*\]?\s*/gi;
const HTML_ENTITY = /&#\d+;|&[a-z]+;/gi;
const WIKI_TABLE = /\|\s*[-!]/g;

export function sanitizeWikiText(text: string): string {
  return text
    .replace(MULTI_TEMPLATE, "")
    .replace(WIKI_TEMPLATE, "")
    .replace(CITATION, "")
    .replace(PRONUNCIATION, "")
    .replace(WIKI_EDIT, " ")
    .replace(HTML_ENTITY, " ")
    .replace(WIKI_TABLE, " ")
    .replace(NESTED_EMPTY_PARENS, "")
    .replace(EMPTY_PARENS, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s•*–—-]+/, "")
    .trim();
}

export function normalizeForComparison(text: string): string {
  return sanitizeWikiText(text)
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
