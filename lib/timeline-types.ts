export const TIMELINE_SCHEMA_VERSION = 1;

export const EVENT_CATEGORIES = [
  "war",
  "invention",
  "person",
  "culture",
  "economy",
  "science",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type TimelineEvent = {
  id: string;
  /** Sort key; negative for BCE. */
  year: number;
  /** End year for ranges; omit for point events. */
  yearEnd?: number;
  /** Display label, e.g. "c. 1500" or "1760–1840". */
  yearLabel: string;
  title: string;
  hook: string;
  detail: string;
  era: string;
  significance: 1 | 2 | 3;
  category: EventCategory;
  wikipediaSlug: string;
  wikipediaTitle: string;
};

export type TimelineEra = {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  description: string;
};

export type TapsaTimeline = {
  slug: string;
  title: string;
  /** User-facing topic phrase. */
  topic: string;
  events: TimelineEvent[];
  eras: TimelineEra[];
  sourceUrl: string;
  generatedAt: string;
  schemaVersion: number;
  origin: "llm" | "fallback";
};
