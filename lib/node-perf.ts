type Mark = {
  click: number;
  paint?: number;
  hydrated?: number;
  source?: string;
};

const marks = new Map<string, Mark>();

export function markNodeClick(slug: string): void {
  marks.set(slug, { click: performance.now() });
}

export function markNodeFirstPaint(slug: string): void {
  const m = marks.get(slug);
  if (!m || m.paint) return;
  m.paint = performance.now();
  log(slug, "first-paint", m.paint - m.click);
}

export function markNodeHydrated(slug: string, source: string): void {
  const m = marks.get(slug);
  if (!m || m.hydrated) return;
  m.hydrated = performance.now();
  m.source = source;
  log(slug, "hydrated", m.hydrated - m.click, source);
}

function log(slug: string, phase: string, ms: number, detail?: string): void {
  const suffix = detail ? ` (${detail})` : "";
  console.info(`[tapsa:perf] ${phase} ${slug} ${Math.round(ms)}ms${suffix}`);
}
