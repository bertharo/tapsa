import type { DatePrecision, TimelineEra, TopicType } from "./timeline-types";
import { parseDateFromText } from "./timeline-dates";

export type EventPoint = {
  sortKey: number;
  precision: DatePrecision;
  sectionName?: string;
};

export type SectionBlock = {
  name: string;
  text: string;
  intro: string;
};

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

function cleanHeading(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First sentence of a section body — connective tissue source. */
export function extractSectionIntro(text: string): string {
  const para = text.split(/\n+/).find((p) => p.trim().length > 20) ?? text;
  const sentence = para.match(/^[^.!?]+[.!?]/)?.[0] ?? para.slice(0, 160);
  return sentence.trim();
}

function headingSortKey(heading: string, sectionText: string): number | null {
  const fromParen = heading.match(/\(([^)]+)\)/);
  const candidates = [heading, fromParen?.[1] ?? ""].filter(Boolean);
  for (const c of candidates) {
    const d = parseDateFromText(c);
    if (d) return d.sortKey;
  }
  const fromText = parseDateFromText(sectionText.slice(0, 300));
  return fromText?.sortKey ?? null;
}

/**
 * True when section order aligns with event chronology — headings work as chapters.
 */
export function sectionsFormChronologicalChapters(
  sections: SectionBlock[],
  events: EventPoint[],
): boolean {
  const withEvents = sections
    .map((s, order) => ({
      order,
      name: s.name,
      events: events.filter((e) => e.sectionName === s.name),
      headingKey: headingSortKey(s.name, s.text),
    }))
    .filter((s) => s.events.length > 0);

  if (withEvents.length < 2) return false;

  let lastAnchor = -Infinity;
  for (const sec of withEvents) {
    const minEvent = Math.min(...sec.events.map((e) => e.sortKey));
    const anchor = sec.headingKey ?? minEvent;
    if (anchor < lastAnchor - 150) return false;
    lastAnchor = Math.max(anchor, minEvent);
  }

  const datedHeadings = withEvents.filter((s) => s.headingKey !== null).length;
  if (datedHeadings >= Math.ceil(withEvents.length * 0.4)) return true;

  let lastMin = -Infinity;
  for (const sec of withEvents) {
    const minDate = Math.min(...sec.events.map((e) => e.sortKey));
    if (minDate < lastMin - 100) return false;
    lastMin = minDate;
  }
  return true;
}

function buildErasFromSections(
  sections: SectionBlock[],
  events: EventPoint[],
): TimelineEra[] {
  const eras: TimelineEra[] = [];
  let eraIndex = 0;
  const usedNames = new Set<string>();

  for (const sec of sections) {
    const secEvents = events.filter((e) => e.sectionName === sec.name);
    if (!secEvents.length) continue;

    eraIndex += 1;
    const start = Math.min(...secEvents.map((e) => e.sortKey));
    const end = Math.max(...secEvents.map((e) => e.sortKey));
    let name = cleanHeading(sec.name);
    if (usedNames.has(name)) name = `${name} (${start})`;
    usedNames.add(name);

    eras.push({
      id: `era-${eraIndex}`,
      name,
      start,
      end,
      summary: sec.intro || undefined,
    });
  }

  const assigned = new Set(events.filter((e) => e.sectionName).map((e) => e.sectionName));
  const orphanEvents = events.filter((e) => !e.sectionName || !assigned.has(e.sectionName));
  if (orphanEvents.length && eras.length) {
    for (const ev of orphanEvents) {
      const era =
        eras.find((e) => ev.sortKey >= e.start && ev.sortKey <= e.end) ??
        eras.reduce((best, e) => {
          const dist = Math.min(Math.abs(ev.sortKey - e.start), Math.abs(ev.sortKey - e.end));
          const bestDist = Math.min(
            Math.abs(ev.sortKey - best.start),
            Math.abs(ev.sortKey - best.end),
          );
          return dist < bestDist ? e : best;
        });
      era.start = Math.min(era.start, ev.sortKey);
      era.end = Math.max(era.end, ev.sortKey);
    }
  }

  return eras.length ? eras : clusterEventsIntoEras(events, "CONCEPT");
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

export type EraBuildInput = {
  sections: SectionBlock[];
  events: EventPoint[];
  topicType: TopicType;
};

/** Prefer section headings as era chapters; fall back to density clustering. */
export function deriveEras(input: EraBuildInput): TimelineEra[] {
  const { sections, events, topicType } = input;
  if (sections.length >= 2 && sectionsFormChronologicalChapters(sections, events)) {
    return buildErasFromSections(sections, events);
  }
  return clusterEventsIntoEras(events, topicType);
}

export function findEraForSortKey(eras: TimelineEra[], sortKey: number): TimelineEra {
  const direct = eras.find((e) => sortKey >= e.start && sortKey <= e.end);
  if (direct) return direct;
  return eras.reduce((best, e) => {
    const dist = Math.min(Math.abs(sortKey - e.start), Math.abs(sortKey - e.end));
    const bestDist = Math.min(Math.abs(sortKey - best.start), Math.abs(sortKey - best.end));
    return dist < bestDist ? e : best;
  });
}

/** Fast preliminary eras from section headings — used before events are extracted. */
export function deriveShellEras(sections: SectionBlock[], topicType: TopicType): TimelineEra[] {
  const dated: { name: string; key: number; intro: string }[] = [];
  for (const sec of sections) {
    const key = headingSortKey(sec.name, sec.text);
    if (key === null) continue;
    dated.push({ name: cleanHeading(sec.name), key, intro: sec.intro });
  }
  dated.sort((a, b) => a.key - b.key);

  if (dated.length >= 2) {
    return dated.slice(0, 8).map((d, i) => ({
      id: `era-${i + 1}`,
      name: d.name,
      start: d.key,
      end: d.key,
      summary: d.intro || undefined,
    }));
  }

  return [
    { id: "era-1", name: fallbackName(0, 3, topicType), start: 0, end: 0 },
    { id: "era-2", name: fallbackName(1, 3, topicType), start: 0, end: 0 },
    { id: "era-3", name: fallbackName(2, 3, topicType), start: 0, end: 0 },
  ];
}
