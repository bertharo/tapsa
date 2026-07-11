#!/usr/bin/env npx tsx
/**
 * Verify timeline extraction across acceptance topics.
 * Usage: npx tsx scripts/verify-timelines.ts
 */
import { resolveArticleTitle } from "../lib/timeline-resolve";
import { resolveChronologicalSources } from "../lib/timeline-sources";
import { extractTimelineFromSources } from "../lib/timeline-extract";
import { attachEventCategories } from "../lib/timeline-event-category";
import { applyTimelineEditorial } from "../lib/timeline-editorial";
import { compareParsedDates } from "../lib/timeline-dates";
import { normalizeForComparison } from "../lib/timeline-text-hygiene";
import { titleToSlug } from "../lib/slug";
import type { TapsaTimeline } from "../lib/timeline-types";

const ACCEPTANCE_QUERIES = [
  "NBA",
  "Cleopatra",
  "the Roman Empire",
  "CRISPR",
  "the potato",
  "1ES 1927+654",
] as const;

const META_TITLE = /^(timeline|list|history|outline|category)\s+(of|for)\b/i;

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

function assertContentQuality(timeline: TapsaTimeline): void {
  for (const e of timeline.events) {
    if (META_TITLE.test(e.title)) {
      throw new Error(`Meta-article rendered as event: "${e.title}"`);
    }
    if (/\(\s*\)/.test(e.title) || /\(\s*\)/.test(e.oneLiner)) {
      throw new Error(`Empty parenthetical artifact: "${e.title}"`);
    }
    const nt = normalizeForComparison(e.title);
    const no = normalizeForComparison(e.oneLiner);
    if (nt && no && nt === no) {
      throw new Error(`Title duplicated as description: "${e.title}"`);
    }
  }
}

function assertCategoriesSane(timeline: TapsaTimeline): void {
  const labeled = timeline.events.filter((e) => e.category);
  if (labeled.length < 3) return;
  const unique = new Set(labeled.map((e) => e.category));
  if (unique.size === 1 && unique.has("CULTURE")) {
    throw new Error("All labeled events are CULTURE — category derivation may be broken");
  }
}

async function buildTimeline(query: string): Promise<TapsaTimeline> {
  const mainTitle = await resolveArticleTitle(query);
  const chronology = await resolveChronologicalSources(mainTitle, query);
  let timeline = await extractTimelineFromSources({
    requestedSlug: titleToSlug(query),
    displayTitle: query,
    chronology,
  });
  timeline = {
    ...timeline,
    events: await attachEventCategories(timeline.events),
  };
  timeline = await applyTimelineEditorial(timeline, chronology.lead);
  return timeline;
}

async function verifyQuery(query: string): Promise<void> {
  console.log(`\n── ${query} ──`);
  const timeline = await buildTimeline(query);

  console.log(`  topic: ${timeline.wikiTitle}`);
  console.log(`  type: ${timeline.topicType}`);
  console.log(`  events: ${timeline.events.length} (sparse: ${timeline.sparse})`);
  console.log(`  eras: ${timeline.eras.map((e) => `${e.name}${e.summary ? " ✓" : ""}`).join(" | ")}`);
  const withTransitions = timeline.events.filter((e) => e.transitionalText).length;
  if (withTransitions) console.log(`  connective: ${withTransitions} transitional snippets`);
  const categories = timeline.events.filter((e) => e.category).map((e) => e.category);
  if (categories.length) {
    console.log(`  categories: ${[...new Set(categories)].join(", ")} (${categories.length} labeled)`);
  }

  assertOrdered(timeline.events);
  assertNoDuplicates(timeline.events);
  assertNoBadImages(timeline.events);
  assertContentQuality(timeline);
  assertCategoriesSane(timeline);

  if (timeline.events.length === 0) throw new Error("No events extracted");
  console.log("  ✓ pass");
}

async function verifyWorldWarII(): Promise<void> {
  console.log("\n── World War II (content gate) ──");
  const timeline = await buildTimeline("World War II");

  console.log(`  events: ${timeline.events.length}`);
  console.log(`  sample: ${timeline.events.slice(0, 4).map((e) => e.title).join(" | ")}`);

  assertContentQuality(timeline);
  if (timeline.events.length < 5) throw new Error("Expected at least 5 WWII events");

  const metaCount = timeline.events.filter((e) => META_TITLE.test(e.title)).length;
  if (metaCount > 0) throw new Error(`${metaCount} meta-article cards remain`);

  const landmarks = timeline.events.filter((e) => e.tier === "landmark");
  if (landmarks.length < 3) throw new Error("Expected multiple landmark WWII events");

  console.log("  ✓ pass");
}

async function verifyEditorialFallback(): Promise<void> {
  console.log("\n── editorial fallback (no API key) ──");
  const savedGroq = process.env.GROQ_API_KEY;
  const savedLlm = process.env.TAPSA_LLM_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.TAPSA_LLM_API_KEY;

  try {
    const timeline = await buildTimeline("CRISPR");
    if (timeline.events.length < 3) throw new Error("Timeline empty without LLM key");
    assertContentQuality(timeline);
    console.log(`  events without LLM: ${timeline.events.length}`);
    console.log("  ✓ pass");
  } finally {
    if (savedGroq) process.env.GROQ_API_KEY = savedGroq;
    if (savedLlm) process.env.TAPSA_LLM_API_KEY = savedLlm;
  }
}

async function main() {
  console.log("Timeline acceptance verification");
  let failed = 0;

  const checks = [
    ...ACCEPTANCE_QUERIES.map((q) => () => verifyQuery(q)),
    () => verifyWorldWarII(),
    () => verifyEditorialFallback(),
  ];

  for (const run of checks) {
    try {
      await run();
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll acceptance topics passed.");
}

main();
