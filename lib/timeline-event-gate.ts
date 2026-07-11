import type { ParsedDate } from "./timeline-dates";
import { isMetaArticleTitle } from "./timeline-meta";
import { bodyNoisePenalty } from "./timeline-section-weight";
import { normalizeForComparison } from "./timeline-text-hygiene";

export type EventGateContext = {
  /** Main topic article title — used to reject document titles matching the source. */
  topicTitle?: string;
  /** Reject range dates wider than this many years (inclusive). */
  maxRangeYears?: number;
};

export type GatedEventCandidate = {
  date: ParsedDate;
  title: string;
  oneLiner: string;
  body: string;
};

const JUNK_TITLE =
  /^(chapter|section|part|unit|module|appendix|references|see also|external links)\s*[\d.:]*$/i;

const DOCUMENT_NOUN =
  /^(the\s+)?(timeline|list|history|outline|chronology|index|glossary|bibliography)\b/i;

const WIKI_JUNK = /! Date !|! Event !|\|\s*-/i;
const DANGLING_TITLE_END =
  /\b(the|a|an|in|on|at|of|and|or|to|for|with|under|during|her|his|their|its|before|after)\s*$/i;

export function isJunkWikiExtract(text: string): boolean {
  if (WIKI_JUNK.test(text)) return true;
  if (/\[?\s*edit\s*\]?/i.test(text)) return true;
  if ((text.match(/\btimeline of\b/gi) ?? []).length >= 2) return true;
  if (/main timelines/i.test(text)) return true;
  if (/^see also\b|^main article\b|^doi\s*:/i.test(text.trim())) return true;
  return false;
}

function isWeakTitle(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length < 12) return true;
  if (DANGLING_TITLE_END.test(title)) return true;
  if (/^(also|main|wars|campaigns|territories)$/i.test(title)) return true;
  if (/see also/i.test(title)) return true;
  return false;
}

function rangeSpanYears(date: ParsedDate): number | null {
  if (date.precision !== "range") return null;
  const m = date.display.match(/(\d{3,4})\s*[–—-]\s*(\d{3,4})/);
  if (!m) return null;
  const a = Number.parseInt(m[1], 10);
  const b = Number.parseInt(m[2], 10);
  if (!a || !b) return null;
  return Math.abs(b - a);
}

export function textsAreRestatement(a: string, b: string): boolean {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) {
    const shorter = na.length < nb.length ? na : nb;
    const longer = na.length >= nb.length ? na : nb;
    if (longer.length - shorter.length < 12) return true;
  }
  const ta = new Set(na.split(" ").filter((w) => w.length > 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  return shared / Math.max(ta.size, tb.size) >= 0.85;
}

function hasSpecificDate(date: ParsedDate, maxRangeYears: number): boolean {
  if (date.precision === "century") return false;
  if (date.precision === "range") {
    const span = rangeSpanYears(date);
    if (span === null) return false;
    if (span > maxRangeYears) return false;
    const m = date.display.match(/(\d{3,4})\s*[–—-]\s*(\d{3,4})/);
    if (m) {
      const a = Number.parseInt(m[1], 10);
      const b = Number.parseInt(m[2], 10);
      if (Math.max(a, b) < 1800) return false;
    }
    return true;
  }
  return true;
}

function titleDescribesOccurrence(title: string, topicTitle?: string): boolean {
  const t = title.trim();
  if (t.length < 4) return false;
  if (JUNK_TITLE.test(t)) return false;
  if (isMetaArticleTitle(t)) return false;
  if (DOCUMENT_NOUN.test(t)) return false;
  if (isJunkWikiExtract(t)) return false;
  if (DANGLING_TITLE_END.test(t)) return false;
  if (isWeakTitle(t)) return false;
  if (topicTitle && normalizeForComparison(t) === normalizeForComparison(topicTitle)) {
    return false;
  }
  return true;
}

/** All three validity checks must pass before an event renders. */
export function passesEventGate(
  candidate: GatedEventCandidate,
  context: EventGateContext = {},
): boolean {
  const maxRange = context.maxRangeYears ?? 2;

  if (!hasSpecificDate(candidate.date, maxRange)) return false;
  if (isJunkWikiExtract(candidate.body) || isJunkWikiExtract(candidate.oneLiner)) return false;
  if (bodyNoisePenalty(candidate.body) < 0) return false;
  if (!titleDescribesOccurrence(candidate.title, context.topicTitle)) return false;
  if (textsAreRestatement(candidate.title, candidate.oneLiner)) return false;
  if (textsAreRestatement(candidate.title, candidate.body)) return false;

  return true;
}
