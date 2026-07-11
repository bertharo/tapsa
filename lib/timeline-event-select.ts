import type { EventTier, TimelineEra, TopicType } from "./timeline-types";
import { MAX_TIMELINE_EVENTS } from "./timeline-types";
import type { RawExtractedEvent } from "./timeline-extract";
import { compareParsedDates } from "./timeline-dates";
import { scoreSignificance } from "./timeline-significance";

function eraIdForEvent(
  ev: RawExtractedEvent,
  eras: { id: string; start: number; end: number }[],
): string {
  const direct = eras.find((e) => ev.date.sortKey >= e.start && ev.date.sortKey <= e.end);
  if (direct) return direct.id;
  return eras.reduce((best, e) => {
    const dist = Math.min(
      Math.abs(ev.date.sortKey - e.start),
      Math.abs(ev.date.sortKey - e.end),
    );
    const bestDist = Math.min(
      Math.abs(ev.date.sortKey - best.start),
      Math.abs(ev.date.sortKey - best.end),
    );
    return dist < bestDist ? e : best;
  }).id;
}

function compareEventPriority(
  a: RawExtractedEvent,
  b: RawExtractedEvent,
  tiers: Map<RawExtractedEvent, EventTier>,
): number {
  const tierA = tiers.get(a) === "landmark" ? 0 : 1;
  const tierB = tiers.get(b) === "landmark" ? 0 : 1;
  if (tierA !== tierB) return tierA - tierB;
  const scoreDiff = scoreSignificance(b) - scoreSignificance(a);
  if (scoreDiff !== 0) return scoreDiff;
  return b.body.length - a.body.length;
}

/**
 * For wide-span concept timelines, cap ancient events so modern history isn't crowded out
 * before the per-era selection pass.
 */
export function capAncientEventFlood(
  events: RawExtractedEvent[],
  topicType: TopicType,
  maxAncient = 14,
): RawExtractedEvent[] {
  if (topicType !== "CONCEPT" || events.length < maxAncient + 8) return events;
  const sorted = [...events].sort((a, b) => compareParsedDates(a.date, b.date));
  const span = sorted[sorted.length - 1]!.date.sortKey - sorted[0]!.date.sortKey;
  if (span < 500) return events;

  const ancient = sorted.filter((e) => e.date.sortKey < 1900);
  const modern = sorted.filter((e) => e.date.sortKey >= 1900);
  if (ancient.length <= maxAncient) return sorted;

  const keptAncient = [...ancient]
    .sort((a, b) => scoreSignificance(b) - scoreSignificance(a))
    .slice(0, maxAncient)
    .sort((a, b) => compareParsedDates(a.date, b.date));

  return [...keptAncient, ...modern].sort((a, b) => compareParsedDates(a.date, b.date));
}

/** Pick events across the full time span — landmarks first within each era. */
export function selectEventsAcrossEras(
  events: RawExtractedEvent[],
  eras: TimelineEra[],
  tiers: Map<RawExtractedEvent, EventTier>,
  maxTotal = MAX_TIMELINE_EVENTS,
): RawExtractedEvent[] {
  if (events.length <= maxTotal) return events;

  const selected: RawExtractedEvent[] = [];
  const selectedSet = new Set<RawExtractedEvent>();
  const perEra = Math.max(4, Math.ceil(maxTotal / Math.max(eras.length, 1)));

  for (const era of eras) {
    const inEra = events
      .filter((e) => eraIdForEvent(e, eras) === era.id)
      .sort((a, b) => compareEventPriority(a, b, tiers));
    for (const ev of inEra) {
      if (selected.length >= maxTotal) break;
      if (selectedSet.has(ev)) continue;
      if (selected.filter((s) => eraIdForEvent(s, eras) === era.id).length >= perEra) break;
      selected.push(ev);
      selectedSet.add(ev);
    }
  }

  if (selected.length < maxTotal) {
    const remaining = events
      .filter((e) => !selectedSet.has(e))
      .sort((a, b) => compareEventPriority(a, b, tiers));
    for (const ev of remaining) {
      if (selected.length >= maxTotal) break;
      selected.push(ev);
      selectedSet.add(ev);
    }
  }

  return selected.sort((a, b) => compareParsedDates(a.date, b.date));
}

/** Drop empty era chapters after event selection. */
export function trimErasToEvents(eras: TimelineEra[], events: { eraId: string }[]): TimelineEra[] {
  const used = new Set(events.map((e) => e.eraId));
  const kept = eras.filter((e) => used.has(e.id));
  return kept.length ? kept : eras.slice(0, 1);
}
