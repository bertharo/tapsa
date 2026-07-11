import type { DatePrecision, TimelineEra, TopicType } from "./timeline-types";

type EventPoint = { sortKey: number; precision: DatePrecision };

function eraLabel(start: number, end: number, topicType: TopicType): string {
  const span = end - start;
  if (topicType === "PERSON" && span <= 120) {
    if (start === end) return String(start);
    return `${start}–${end}`;
  }
  if (span > 800 || (start < 0 && end > 1000)) {
    const s = start < 0 ? `${Math.abs(start)} BCE` : String(start);
    const e = end < 0 ? `${Math.abs(end)} BCE` : String(end);
    return `${s}–${e}`;
  }
  if (span > 80) {
    const decade = (y: number) => `${Math.floor(y / 10) * 10}s`;
    return `${decade(start)}–${decade(end)}`;
  }
  if (start === end) return String(start);
  return `${start}–${end}`;
}

function fallbackName(index: number, total: number, topicType: TopicType): string {
  if (topicType === "PERSON") {
    if (index === 0) return "Early life";
    if (index === total - 1) return "Later years";
    return "Middle years";
  }
  if (topicType === "ORGANIZATION") {
    if (index === 0) return "Founding";
    if (index === total - 1) return "Present era";
    return "Growth";
  }
  if (topicType === "EVENT") {
    if (index === 0) return "Background";
    if (index === total - 1) return "Aftermath";
    return "The event";
  }
  if (index === 0) return "Origins";
  if (index === total - 1) return "Modern era";
  return "Development";
}

/**
 * Cluster event dates into 3–6 eras by temporal density. Labels derived from span.
 */
export function clusterEventsIntoEras(
  points: EventPoint[],
  topicType: TopicType,
): TimelineEra[] {
  if (!points.length) {
    return [{ id: "era-1", name: "Timeline", start: 0, end: 0 }];
  }

  const sorted = [...points].sort((a, b) => a.sortKey - b.sortKey);
  const min = sorted[0].sortKey;
  const max = sorted[sorted.length - 1].sortKey;
  const span = max - min;

  let bucketCount = 3;
  if (span > 3000) bucketCount = 6;
  else if (span > 1000) bucketCount = 5;
  else if (span > 300) bucketCount = 4;
  else if (sorted.length < 6) bucketCount = Math.max(1, Math.min(3, sorted.length));

  if (min === max) {
    return [{ id: "era-1", name: String(min), start: min, end: max }];
  }

  const bucketSize = span / bucketCount;
  const buckets: EventPoint[][] = Array.from({ length: bucketCount }, () => []);

  for (const p of sorted) {
    const idx = Math.min(bucketCount - 1, Math.floor((p.sortKey - min) / (bucketSize || 1)));
    buckets[idx].push(p);
  }

  const eras: TimelineEra[] = [];
  let eraIndex = 0;
  const usedNames = new Set<string>();
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (!b.length) continue;
    eraIndex += 1;
    const start = b[0].sortKey;
    const end = b[b.length - 1].sortKey;
    const label = eraLabel(start, end, topicType);
    let name =
      label.length > 4 ? label : fallbackName(eras.length, bucketCount, topicType);
    if (usedNames.has(name)) {
      name = `${name} (${start})`;
    }
    usedNames.add(name);
    eras.push({
      id: `era-${eraIndex}`,
      name,
      start,
      end,
    });
  }

  if (!eras.length) {
    return [{ id: "era-1", name: eraLabel(min, max, topicType), start: min, end: max }];
  }

  return eras;
}
