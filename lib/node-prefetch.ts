const MAX_CONCURRENCY = 4;

const queued = new Set<string>();
const inflight = new Set<string>();
const warmed = new Set<string>();

export function isNodeWarmed(slug: string): boolean {
  return warmed.has(slug);
}

export function markNodeWarmed(slug: string): void {
  warmed.add(slug);
}

/** Background-warm a node without blocking UI. Dedupes queued/inflight/warmed. */
export function prefetchNode(slug: string, loader: (slug: string) => Promise<void>): void {
  if (!slug || warmed.has(slug) || inflight.has(slug) || queued.has(slug)) return;
  queued.add(slug);
  void drain(loader);
}

async function drain(loader: (slug: string) => Promise<void>): Promise<void> {
  while (inflight.size < MAX_CONCURRENCY && queued.size > 0) {
    const slug = queued.values().next().value as string;
    queued.delete(slug);
    inflight.add(slug);
    loader(slug)
      .then(() => {
        warmed.add(slug);
      })
      .catch(() => {
        /* best-effort */
      })
      .finally(() => {
        inflight.delete(slug);
        void drain(loader);
      });
  }
}
