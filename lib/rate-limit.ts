/**
 * Soft per-IP rate limit for COLD (uncached) generations only. Cached reads are
 * never limited. In-memory fixed window — fine for v1 single-instance; swap for
 * a Redis/Upstash counter when running multi-instance on Vercel.
 */

const WINDOW_MS = 60 * 1000;
const MAX_COLD_PER_WINDOW = Number(process.env.TAPSA_COLD_LIMIT ?? 8);

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateResult = { allowed: boolean; remaining: number; resetAt: number };

export function checkColdLimit(ip: string): RateResult {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  if (bucket.count >= MAX_COLD_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: MAX_COLD_PER_WINDOW - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/** Best-effort client IP extraction from request headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
