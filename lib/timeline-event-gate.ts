import type { ParsedDate } from "./timeline-dates";
import { isMetaArticleTitle } from "./timeline-meta";
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
    return span <= maxRangeYears;
  }
  return true;
}

function titleDescribesOccurrence(title: string, topicTitle?: string): boolean {
  const t = title.trim();
  if (t.length < 4) return false;
  if (JUNK_TITLE.test(t)) return false;
  if (isMetaArticleTitle(t)) return false;
  if (DOCUMENT_NOUN.test(t)) return false;
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
  if (!titleDescribesOccurrence(candidate.title, context.topicTitle)) return false;
  if (textsAreRestatement(candidate.title, candidate.oneLiner)) return false;
  if (textsAreRestatement(candidate.title, candidate.body)) return false;

  return true;
}
