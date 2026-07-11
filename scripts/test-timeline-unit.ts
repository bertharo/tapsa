/** Unit checks for timeline date parsing, dedupe, eras, and image gating. */
import assert from "node:assert/strict";
import { compareParsedDates, parseDateFromText } from "../lib/timeline-dates";
import { assignTiers, scoreSignificance } from "../lib/timeline-significance";
import { sectionLandmarkWeight, actionTitleWeight } from "../lib/timeline-section-weight";
import { dedupeEvents, type RawExtractedEvent } from "../lib/timeline-extract";
import { clusterEventsIntoEras, deriveEras, sectionsFormChronologicalChapters } from "../lib/timeline-eras";
import { gateImage } from "../lib/timeline-images-gate";
import { categoryFromWikiCategories } from "../lib/timeline-event-category";

function testDates() {
  const bce = parseDateFromText("44 BC");
  assert.equal(bce?.sortKey, -44);

  const mdy = parseDateFromText("January 15, 1891");
  assert.equal(mdy?.sortKey, 1891);
  assert.equal(mdy?.precision, "day");

  const century = parseDateFromText("3rd century BC");
  assert.ok(century && century.sortKey < 0);
  assert.equal(century?.precision, "century");

  const range = parseDateFromText("1840–1870");
  assert.equal(range?.sortKey, 1840);

  const day = parseDateFromText("March 4, 1789")!;
  const year = parseDateFromText("1789")!;
  assert.ok(compareParsedDates(day, year) < 0);
}

function testSignificance() {
  const mk = (partial: Partial<RawExtractedEvent>): RawExtractedEvent => ({
    date: { sortKey: 1900, precision: "year", display: "1900", subSort: 0 },
    title: "Event",
    oneLiner: "Event happened",
    body: "Short",
    wikiTitle: "Test",
    inLead: false,
    linkCount: 0,
    hasOwnArticle: false,
    ...partial,
  });
  const lead = mk({ inLead: true, body: "x".repeat(200) });
  const minor = mk({ body: "tiny" });
  assert.ok(scoreSignificance(lead) > scoreSignificance(minor));

  const events = [lead, minor, mk({ title: "B" }), mk({ title: "C" }), mk({ title: "D" })];
  const eras = [{ id: "era-1", start: 1800, end: 2000 }];
  const tiers = assignTiers(events, eras);
  assert.equal(tiers.get(lead), "landmark");
  assert.equal(tiers.get(minor), "context");
}

function testDedupe() {
  const mk = (title: string, year: number): RawExtractedEvent => ({
    date: { sortKey: year, precision: "year", display: String(year), subSort: 0 },
    title,
    oneLiner: title,
    body: title,
    wikiTitle: "Test",
    inLead: false,
    linkCount: 0,
    hasOwnArticle: false,
  });
  const out = dedupeEvents([mk("Founding", 1891), mk("Founding", 1891)]);
  assert.equal(out.length, 1);
}

function testEras() {
  const points = [1800, 1850, 1900, 1950, 2000].map((sortKey) => ({
    sortKey,
    precision: "year" as const,
  }));
  const eras = clusterEventsIntoEras(points, "CONCEPT");
  assert.ok(eras.length >= 3);

  const sections = [
    { name: "Early life", text: "In 69 BC she was born.", intro: "Formative years." },
    { name: "Reign", text: "In 51 BC she became queen.", intro: "Rule began." },
  ];
  const events = [
    { sortKey: -69, precision: "year" as const, sectionName: "Early life" },
    { sortKey: -51, precision: "year" as const, sectionName: "Reign" },
    { sortKey: -30, precision: "year" as const, sectionName: "Reign" },
  ];
  assert.ok(sectionsFormChronologicalChapters(sections, events));
  const derived = deriveEras({ sections, events, topicType: "PERSON" });
  assert.equal(derived[0]?.name, "Early life");
  assert.ok(derived[0]?.summary);
}

function testImages() {
  assert.equal(
    gateImage({ url: "https://x/y.jpg", width: 50, height: 50, mime: "image/jpeg" }),
    null,
  );
  assert.equal(
    gateImage({
      url: "https://upload.wikimedia.org/logo.png",
      width: 400,
      height: 400,
      mime: "image/png",
    }),
    null,
  );
  const ok = gateImage({
    url: "https://upload.wikimedia.org/photo.jpg",
    width: 800,
    height: 450,
    mime: "image/jpeg",
  });
  assert.ok(ok?.url.includes("photo"));
}

function testCategories() {
  assert.equal(categoryFromWikiCategories(["World War II battles"]), "MILITARY");
  assert.equal(categoryFromWikiCategories(["American political history"]), "POLITICS");
  assert.equal(categoryFromWikiCategories(["Random disambiguation pages"]), undefined);
}

function testSectionWeight() {
  assert.ok(sectionLandmarkWeight("War breaks out in the Pacific (1941)") > 0);
  assert.ok(sectionLandmarkWeight("Background") < 0);
  assert.ok(actionTitleWeight("Invasion of Poland") > 0);
  assert.ok(scoreSignificance({
    date: { sortKey: 1939, precision: "day", display: "1939", subSort: 0 },
    title: "Invasion of Poland",
    oneLiner: "Germany invaded Poland",
    body: "Germany invaded Poland on 1 September 1939.",
    wikiTitle: "Invasion_of_Poland",
    inLead: false,
    linkCount: 1,
    hasOwnArticle: true,
    sectionName: "War breaks out in Europe (1939–1940)",
  }) > scoreSignificance({
    date: { sortKey: 1920, precision: "year", display: "1920", subSort: 0 },
    title: "League of Nations",
    oneLiner: "League formed",
    body: "League of Nations was established in 1920.",
    wikiTitle: "World_War_II",
    inLead: false,
    linkCount: 0,
    hasOwnArticle: false,
    sectionName: "Background",
  }));
}

testDates();
testSignificance();
testDedupe();
testEras();
testImages();
testCategories();
testSectionWeight();
console.log("timeline unit checks passed");
