export const TIMELINE_SCHEMA_VERSION = 5;

export const MIN_TIMELINE_EVENTS = 5;
export const SPARSE_EVENT_THRESHOLD = 5;

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
export type DatePrecision = "day" | "month" | "year" | "century" | "range";
export type EventTier = "landmark" | "context";
export type TopicType =
  | "PERSON"
  | "ORGANIZATION"
  | "EVENT"
  | "PLACE"
  | "CONCEPT"
  | "CREATIVE_WORK";

export type TimelineImageMeta = {
  url: string;
  width: number;
  height: number;
  mime: string;
};

export type TimelineEvent = {
  id: string;
  yearDisplay: string;
  yearSort: number;
  sortKey: number;
  precision: DatePrecision;
  title: string;
  oneLiner: string;
  body: string;
  category: EventCategory;
  eraId: string;
  tier: EventTier;
  transitionalText?: string;
  /** Wikipedia article title, underscore form. */
  wikiTitle: string;
  wikipediaSlug: string;
  /** Gated image metadata — absent when typographic fallback is used. */
  image?: TimelineImageMeta | null;
  /** @deprecated use image.url — kept for transitional UI compatibility */
  imageUrl?: string;
};

export type TimelineEra = {
  id: string;
  name: string;
  start: number;
  end: number;
  summary?: string;
};

export type AdjacentTopic = { title: string; slug: string };

export type TapsaTimeline = {
  slug: string;
  title: string;
  topic: string;
  events: TimelineEvent[];
  eras: TimelineEra[];
  sourceUrl: string;
  generatedAt: string;
  schemaVersion: number;
  origin: "wikipedia" | "llm" | "fallback";
  wikiTitle: string;
  revisionId: number;
  cacheKey: string;
  topicType: TopicType;
  orientation: string;
  sparse: boolean;
  adjacentTopics?: AdjacentTopic[];
};
