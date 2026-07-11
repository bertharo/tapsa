#!/usr/bin/env npx tsx
/** Grep-level check: no acceptance-topic literals in timeline logic. */
import { execSync } from "node:child_process";

const PATTERNS = ["nba", "cleopatra", "roman empire", "crispr", "potato"];
const PATHS = "lib/timeline-*.ts lib/timeline-*.tsx components/timelines scripts/verify-timelines.ts scripts/test-timeline-unit.ts";

let failed = false;
for (const p of PATTERNS) {
  try {
    execSync(`rg -i "${p}" ${PATHS} --glob '!**/*.md'`, { stdio: "pipe" });
    console.error(`FAIL: found literal "${p}" in timeline code`);
    failed = true;
  } catch {
    /* rg exits 1 when no matches — expected */
  }
}

if (failed) process.exit(1);
console.log("grep check passed: no topic literals in timeline logic");
