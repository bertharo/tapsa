const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 3;
const DEFAULT_CONCURRENCY = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffWithJitter(attempt: number): number {
  const base = 300 * 2 ** attempt;
  return base + Math.random() * base * 0.3;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    return /network|failed to fetch|ERR_NETWORK|ECONNRESET|ETIMEDOUT/i.test(err.message);
  }
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export type TimelineFetchInit = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

/** Fetch with per-request timeout, exponential backoff + jitter, and transient failure retry. */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: TimelineFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, ...fetchInit } = init;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...fetchInit, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && isRetryableStatus(res.status) && attempt < retries - 1) {
        await sleep(backoffWithJitter(attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries - 1 && isRetryableError(err)) {
        await sleep(backoffWithJitter(attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Fetch failed after retries");
}

class FetchQueue {
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.running < this.concurrency) {
          this.running += 1;
          resolve();
        } else {
          this.waiters.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.running -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const wikiQueue = new FetchQueue(DEFAULT_CONCURRENCY);

/** Queued Wikipedia fetch — limits in-flight requests across the timeline pipeline. */
export function timelineFetch(
  input: RequestInfo | URL,
  init?: TimelineFetchInit,
): Promise<Response> {
  return wikiQueue.run(() => fetchWithRetry(input, init));
}
