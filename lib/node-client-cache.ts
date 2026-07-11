import type { TapsaNode } from "./types";
import { SCHEMA_VERSION } from "./types";

const DB_NAME = "tapsa-nodes";
const STORE = "nodes";
const CACHE_KEY_PREFIX = `v${SCHEMA_VERSION}:`;

function idbKey(slug: string): string {
  return `${CACHE_KEY_PREFIX}${slug}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readIdb(slug: string): Promise<TapsaNode | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const get = tx.objectStore(STORE).get(idbKey(slug));
      get.onsuccess = () => {
        const node = get.result as TapsaNode | undefined;
        if (node?.schemaVersion !== SCHEMA_VERSION) resolve(null);
        else resolve(node ?? null);
      };
      get.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeIdb(node: TapsaNode): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(node, idbKey(node.slug));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* quota or private mode */
  }
}

/** Session memory + IndexedDB persistence for explorer nodes. */
export class NodeClientCache {
  private memory = new Map<string, TapsaNode>();

  seed(node: TapsaNode): void {
    this.memory.set(node.slug, node);
    void writeIdb(node);
  }

  getSync(slug: string): TapsaNode | null {
    return this.memory.get(slug) ?? null;
  }

  async get(slug: string): Promise<TapsaNode | null> {
    const mem = this.memory.get(slug);
    if (mem) return mem;
    const idb = await readIdb(slug);
    if (idb) this.memory.set(slug, idb);
    return idb;
  }

  set(node: TapsaNode): void {
    this.memory.set(node.slug, node);
    void writeIdb(node);
  }

  has(slug: string): boolean {
    return this.memory.has(slug);
  }
}

let singleton: NodeClientCache | null = null;

export function getNodeClientCache(): NodeClientCache {
  if (!singleton) singleton = new NodeClientCache();
  return singleton;
}
