/**
 * Pre-bake the common paths so the first visitors hit warm cache (instant +
 * free). Run with: `npm run prebake`. Reads ANTHROPIC_API_KEY from .env.local
 * if present; without it, nodes are generated via the heuristic fallback.
 *
 * This is intentionally a thin batch over the same pipeline the API uses, so
 * there's a single code path for generation + caching.
 */
import { PREBAKE_SEEDS } from "../lib/starter-topics";
import { getOrCreateNode } from "../lib/node-service";

// Node 20.6+: load env vars from .env.local without a dependency.
for (const file of [".env.local", ".env"]) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(
      file,
    );
  } catch {
    /* file missing; ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const usingLlm = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(
    `[prebake] Generating ${PREBAKE_SEEDS.length} seed nodes ` +
      `(${usingLlm ? "Claude" : "fallback heuristic — set ANTHROPIC_API_KEY for real selection"}).`,
  );

  let ok = 0;
  let failed = 0;
  for (const seed of PREBAKE_SEEDS) {
    try {
      const { node, cacheHit } = await getOrCreateNode(seed.slug, seed.domain);
      console.log(
        `  ${cacheHit ? "cached" : "baked "} · ${node.slug} ` +
          `(${node.connections.length} connections, ${node.origin})`,
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      console.warn(`  failed · ${seed.slug}: ${(err as Error).message}`);
    }
    // Be polite to Wikipedia + the LLM API.
    await sleep(usingLlm ? 600 : 200);
  }

  console.log(`[prebake] Done. ${ok} ok, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
