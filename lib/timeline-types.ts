export const TIMELINE_SCHEMA_VERSION = 3;

export const EVENT_CATEGORIES = [
  "SCIENCE",
  "MATHEMATICS",
  "PHYSICS",
  "ASTRONOMY",
  "OBSERVATION",
  "PHILOSOPHY",
  "CULTURE",
  "TECHNOLOGY",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type TimelineEvent = {
  id: string;
  yearDisplay: string;
  yearSort: number;
  title: string;
  oneLiner: string;
  body: string;
  category: EventCategory;
  eraId: string;
  /** Wikipedia article title, underscore form. */
  wikiTitle: string;
  wikipediaSlug: string;
  /** Lead thumbnail URL, cached at generation time. */
  imageUrl?: string;
};

export type TimelineEra = {
  id: string;
  name: string;
  start: number;
  end: number;
};

export type TapsaTimeline = {
  slug: string;
  title: string;
  topic: string;
  events: TimelineEvent[];
  eras: TimelineEra[];
  sourceUrl: string;
  generatedAt: string;
  schemaVersion: number;
  origin: "llm" | "fallback";
  /** Resolved Wikipedia article title. */
  wikiTitle: string;
  /** Wikipedia revision id at generation time — cache invalidates on change. */
  revisionId: number;
  cacheKey: string;
};
