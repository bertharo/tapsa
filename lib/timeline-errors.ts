/** Shared timeline error types — keep in a leaf module so instanceof works across bundles. */

export class TopicNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Topic not found: ${slug}`);
    this.name = "TopicNotFoundError";
  }
}

export class TimelineTooThinError extends Error {
  constructor(
    public slug: string,
    public title: string,
  ) {
    super(`Not enough dated history for timeline: ${title}`);
    this.name = "TimelineTooThinError";
  }
}

export class TimelineUnavailableError extends Error {
  constructor(public reason: "missing_api_key" | "rate_limit" | "unknown") {
    super(`Timeline generation unavailable: ${reason}`);
    this.name = "TimelineUnavailableError";
  }
}

export function isTopicNotFound(err: unknown): err is TopicNotFoundError {
  return err instanceof TopicNotFoundError || (err as Error)?.name === "TopicNotFoundError";
}

export function isTimelineTooThin(err: unknown): err is TimelineTooThinError {
  return err instanceof TimelineTooThinError || (err as Error)?.name === "TimelineTooThinError";
}

export function isTimelineUnavailable(err: unknown): err is TimelineUnavailableError {
  return err instanceof TimelineUnavailableError || (err as Error)?.name === "TimelineUnavailableError";
}
