import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { TapsaTimeline } from "./timeline-types";
import { TIMELINE_SCHEMA_VERSION } from "./timeline-types";

export interface TimelineStore {
  get(slug: string): Promise<TapsaTimeline | null>;
  set(timeline: TapsaTimeline): Promise<void>;
}

function resolveCacheDir(): string {
  if (process.env.TAPSA_CACHE_DIR) {
    return path.join(process.env.TAPSA_CACHE_DIR, "timelines");
  }
  const isServerless =
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.NETLIFY ||
    process.env.NEXT_RUNTIME === "edge";
  const base = isServerless ? os.tmpdir() : process.cwd();
  return path.join(base, ".tapsa-cache", "timelines");
}

const CACHE_DIR = resolveCacheDir();

function safeKey(slug: string): string {
  return slug.replace(/[^a-z0-9-]/gi, "_");
}

class FileSystemTimelineStore implements TimelineStore {
  private memo = new Map<string, TapsaTimeline>();
  private warnedWriteFailure = false;

  private file(slug: string): string {
    return path.join(CACHE_DIR, `${safeKey(slug)}.json`);
  }

  async get(slug: string): Promise<TapsaTimeline | null> {
    if (this.memo.has(slug)) return this.memo.get(slug)!;
    try {
      const raw = await fs.readFile(this.file(slug), "utf8");
      const timeline = JSON.parse(raw) as TapsaTimeline;
      if (timeline.schemaVersion !== TIMELINE_SCHEMA_VERSION) return null;
      this.memo.set(slug, timeline);
      return timeline;
    } catch {
      return null;
    }
  }

  async set(timeline: TapsaTimeline): Promise<void> {
    this.memo.set(timeline.slug, timeline);
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(this.file(timeline.slug), JSON.stringify(timeline, null, 2), "utf8");
    } catch (err) {
      if (!this.warnedWriteFailure) {
        this.warnedWriteFailure = true;
        console.warn("[tapsa:timeline-cache] disk persistence disabled:", (err as Error)?.message ?? err);
      }
    }
  }
}

let store: TimelineStore | null = null;

export function getTimelineStore(): TimelineStore {
  if (!store) store = new FileSystemTimelineStore();
  return store;
}
