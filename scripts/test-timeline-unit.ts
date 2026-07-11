/** Unit checks for timeline date parsing, dedupe, eras, and image gating. */
import assert from "node:assert/strict";
import { compareParsedDates, parseDateFromText } from "../lib/timeline-dates";
import { dedupeEvents, type RawExtractedEvent } from "../lib/timeline-extract";
import { clusterEventsIntoEras, deriveEras, sectionsFormChronologicalChapters } from "../lib/timeline-eras";
import { gateImage } from "../lib/timeline-images-gate";

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

testDates();
testDedupe();
testEras();
testImages();
console.log("timeline unit checks passed");
