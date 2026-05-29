import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { TapsaNode } from "./types";
import { SCHEMA_VERSION } from "./types";

/**
 * Node store interface. Swap the implementation for Vercel KV or Postgres in
 * production without touching call sites. Filesystem is the zero-setup default
 * so the app runs end-to-end locally and during the pre-bake batch.
 */
export interface NodeStore {
  get(slug: string): Promise<TapsaNode | null>;
  set(node: TapsaNode): Promise<void>;
  has(slug: string): Promise<boolean>;
}

/**
 * Pick a writable cache directory.
 *
 * Serverless hosts (Vercel, AWS Lambda, etc.) mount the deployment bundle —
 * including process.cwd() — as a READ-ONLY filesystem; only the OS temp dir
 * (e.g. /tmp) is writable. Writing the cache under cwd there throws EROFS on
 * every cold generation, which previously surfaced as an unhandled
 * "server-side exception" on every fresh card click. We honor an explicit
 * override, fall back to the temp dir on known serverless runtimes, and use the
 * project-local dir for normal local/dev use (so the pre-bake cache persists).
 */
function resolveCacheDir(): string {
  if (process.env.TAPSA_CACHE_DIR) {
    return path.join(process.env.TAPSA_CACHE_DIR, "nodes");
  }
  const isServerless =
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.NETLIFY ||
    process.env.NEXT_RUNTIME === "edge";
  const base = isServerless ? os.tmpdir() : process.cwd();
  return path.join(base, ".tapsa-cache", "nodes");
}

const CACHE_DIR = resolveCacheDir();

function safeKey(slug: string): string {
  // Slugs are already URL-safe, but guard against traversal just in case.
  return slug.replace(/[^a-z0-9-]/gi, "_");
}

class FileSystemStore implements NodeStore {
  private memo = new Map<string, TapsaNode>();
  private warnedWriteFailure = false;

  private file(slug: string): string {
    return path.join(CACHE_DIR, `${safeKey(slug)}.json`);
  }

  async get(slug: string): Promise<TapsaNode | null> {
    if (this.memo.has(slug)) return this.memo.get(slug)!;
    try {
      const raw = await fs.readFile(this.file(slug), "utf8");
      const node = JSON.parse(raw) as TapsaNode;
      // Invalidate stale schema versions automatically.
      if (node.schemaVersion !== SCHEMA_VERSION) return null;
      this.memo.set(slug, node);
      return node;
    } catch {
      return null;
    }
  }

  async set(node: TapsaNode): Promise<void> {
    // In-memory memo first: this is what serves the current request and keeps
    // the app correct even if the disk is unavailable.
    this.memo.set(node.slug, node);
    // Persisting to disk is a best-effort optimization, never a hard
    // requirement. A read-only or full filesystem must not fail the request.
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(this.file(node.slug), JSON.stringify(node, null, 2), "utf8");
    } catch (err) {
      if (!this.warnedWriteFailure) {
        this.warnedWriteFailure = true;
        console.warn(
          `[tapsa:cache] disk persistence disabled (${(err as Error)?.message ?? err}); ` +
            `serving from in-memory cache. Set TAPSA_CACHE_DIR to a writable path or ` +
            `wire up a durable store (Vercel KV / Postgres) for cross-request caching.`,
        );
      }
    }
  }

  async has(slug: string): Promise<boolean> {
    return (await this.get(slug)) !== null;
  }
}

let store: NodeStore | null = null;

/** Returns the configured node store (singleton). */
export function getStore(): NodeStore {
  if (!store) store = new FileSystemStore();
  return store;
}
