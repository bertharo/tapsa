import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* optional */
}

async function main() {
  const slug = process.argv[2] ?? "history-of-basketball";
  const { getOrCreateTimeline } = await import("../lib/timeline-service");
  try {
    const r = await getOrCreateTimeline(slug);
    console.log("OK", r.timeline.title, r.timeline.events.length, "events");
  } catch (e) {
    const err = e as Error;
    console.error("ERR", err.name, err.message);
    process.exit(1);
  }
}

main();
