/**
 * Lightweight first-class metrics: cache hit rate + cost-per-node proxy. In v1
 * these are process-counters logged to stdout; pipe into Vercel Analytics or a
 * real event log later. Kept intentionally tiny.
 */

type Counters = {
  nodeRequests: number;
  cacheHits: number;
  coldGenerations: number;
  llmGenerations: number;
  fallbackGenerations: number;
};

const counters: Counters = {
  nodeRequests: 0,
  cacheHits: 0,
  coldGenerations: 0,
  llmGenerations: 0,
  fallbackGenerations: 0,
};

export type NodeEvent =
  | { kind: "cache_hit"; slug: string }
  | { kind: "cold_generation"; slug: string; origin: "llm" | "fallback"; ms: number };

export function recordNodeEvent(event: NodeEvent): void {
  counters.nodeRequests += 1;
  if (event.kind === "cache_hit") {
    counters.cacheHits += 1;
  } else {
    counters.coldGenerations += 1;
    if (event.origin === "llm") counters.llmGenerations += 1;
    else counters.fallbackGenerations += 1;
  }
  const hitRate =
    counters.nodeRequests > 0
      ? ((counters.cacheHits / counters.nodeRequests) * 100).toFixed(1)
      : "0.0";
  console.log(
    `[tapsa:metrics] ${JSON.stringify({ ...event, hitRatePct: hitRate })}`,
  );
}

export function snapshot(): Counters & { cacheHitRatePct: number } {
  const cacheHitRatePct =
    counters.nodeRequests > 0
      ? (counters.cacheHits / counters.nodeRequests) * 100
      : 0;
  return { ...counters, cacheHitRatePct };
}
