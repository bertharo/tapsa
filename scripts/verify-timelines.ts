#!/usr/bin/env npx tsx
/**
 * Verify timeline extraction across acceptance topics.
 * Usage: npx tsx scripts/verify-timelines.ts
 */
import { resolveArticleTitle } from "../lib/timeline-resolve";
import { resolveChronologicalSources } from "../lib/timeline-sources";
import {
  dedupeEvents,
  extractTimelineFromSources,
} from "../lib/timeline-extract";
import { compareParsedDates } from "../lib/timeline-dates";
import { titleToSlug } from "../lib/slug";

const ACCEPTANCE_QUERIES = [
  "NBA",
  "Cleopatra",
  "the Roman Empire",
  "CRISPR",
  "the potato",
  "1ES 1927+654",
] as const;

function assertOrdered(events: { sortKey: number; precision: string; title: string }[]): void {
  for (let i = 1; i < events.length; i++) {
    const cmp = compareParsedDates(
      { sortKey: events[i - 1].sortKey, precision: events[i - 1].precision as "year", display: "", subSort: 0 },
      { sortKey: events[i].sortKey, precision: events[i].precision as "year", display: "", subSort: 0 },
    );
    if (cmp > 0) {
      throw new Error(
        `Out of order: "${events[i - 1].title}" (${events[i - 1].sortKey}) before "${events[i].title}" (${events[i].sortKey})`,
      );
    }
  }
}

function assertNoDuplicates(events: { title: string; sortKey: number }[]): void {
  const seen = new Set<string>();
  for (const e of events) {
    const key = `${e.sortKey}:${e.title.toLowerCase().replace(/[^\w]+/g, "")}`;
    if (seen.has(key)) throw new Error(`Duplicate: ${e.title} @ ${e.sortKey}`);
    seen.add(key);
  }
}

function assertNoBadImages(events: { imageUrl?: string; image?: { url: string } | null }[]): void {
  for (const e of events) {
    const url = e.image?.url ?? e.imageUrl ?? "";
    if (!url) continue;
    if (/logo|icon|flag|seal|emblem|svg/i.test(url)) {
      throw new Error(`Rejected image URL: ${url}`);
    }
  }
}

async function verifyQuery(query: string): Promise<void> {
  console.log(`\n── ${query} ──`);
  const mainTitle = await resolveArticleTitle(query);
  const chronology = await resolveChronologicalSources(mainTitle, query);
  const timeline = await extractTimelineFromSources({
    requestedSlug: titleToSlug(query),
    displayTitle: query,
    chronology,
  });

  console.log(`  topic: ${timeline.wikiTitle}`);
  console.log(`  type: ${timeline.topicType}`);
  console.log(`  events: ${timeline.events.length} (sparse: ${timeline.sparse})`);
  console.log(`  eras: ${timeline.eras.map((e) => `${e.name}${e.summary ? " ✓" : ""}`).join(" | ")}`);
  const withTransitions = timeline.events.filter((e) => e.transitionalText).length;
  if (withTransitions) console.log(`  connective: ${withTransitions} transitional snippets`);

  assertOrdered(timeline.events);
  assertNoDuplicates(timeline.events);
  assertNoBadImages(timeline.events);

  if (timeline.events.length === 0) throw new Error("No events extracted");
  console.log("  ✓ pass");
}

async function main() {
  console.log("Timeline acceptance verification");
  let failed = 0;
  for (const q of ACCEPTANCE_QUERIES) {
    try {
      await verifyQuery(q);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} topic(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll acceptance topics passed.");
}

main();
