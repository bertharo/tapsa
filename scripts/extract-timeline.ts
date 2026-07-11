/**
 * Verify timeline extraction for any topic. Usage:
 *   npx tsx scripts/extract-timeline.ts "<query>"
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* optional */
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: npx tsx scripts/extract-timeline.ts \"<topic query>\"");
    process.exit(1);
  }

  const { resolveTimelineArticle, THIN_ARTICLE_WORD_LIMIT, timelineCacheKey } = await import(
    "../lib/timeline-resolve"
  );
  const { generateTimeline } = await import("../lib/timeline-llm");

  const primary = await resolveTimelineArticle(query, { widen: false });
  let candidate = primary;
  if (primary.wordCount < THIN_ARTICLE_WORD_LIMIT) {
    const widened = await resolveTimelineArticle(query, { widen: true });
    if (widened.supplements.length > 0) {
      console.error(
        `Thin primary (${primary.wordCount} words) — trying ${widened.extractionTitle}`,
      );
      candidate = widened;
    }
  }

  console.error(
    `Resolved: ${candidate.title} (rev ${candidate.revisionId}, ${candidate.wordCount} words)`,
  );

  const run = (a: typeof candidate) =>
    generateTimeline("verify", query, a.extractionTitle, a.text, a.sourceUrl, {
      revisionId: a.revisionId,
      cacheKey: timelineCacheKey(a.title, a.revisionId),
      supplements: a.supplements,
    });

  let timeline;
  try {
    timeline = await run(candidate);
  } catch (firstErr) {
    if (candidate !== primary) {
      console.error(
        "Widened extraction failed — falling back to primary article...",
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
      try {
        timeline = await run(primary);
      } catch (secondErr) {
        console.error(secondErr);
        throw secondErr;
      }
    } else {
      console.error(firstErr);
      throw firstErr;
    }
  }

  const output = {
    topic: timeline.topic,
    wiki_title: timeline.wikiTitle,
    eras: timeline.eras.map((e) => ({
      id: e.id,
      name: e.name,
      start: e.start,
      end: e.end,
    })),
    events: timeline.events.map((e) => ({
      year_display: e.yearDisplay,
      year_sort: e.yearSort,
      title: e.title,
      one_liner: e.oneLiner,
      body: e.body,
      category: e.category,
      era_id: e.eraId,
      wiki_title: e.wikiTitle,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
