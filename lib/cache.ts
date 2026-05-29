import { promises as fs } from "fs";
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

const CACHE_DIR = path.join(process.cwd(), ".tapsa-cache", "nodes");

function safeKey(slug: string): string {
  // Slugs are already URL-safe, but guard against traversal just in case.
  return slug.replace(/[^a-z0-9-]/gi, "_");
}

class FileSystemStore implements NodeStore {
  private memo = new Map<string, TapsaNode>();

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
    this.memo.set(node.slug, node);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(this.file(node.slug), JSON.stringify(node, null, 2), "utf8");
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
