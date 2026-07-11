/** Unit checks for timeline text hygiene, meta detection, and event validity gate. */
import assert from "node:assert/strict";
import { passesEventGate } from "../lib/timeline-event-gate";
import { extractLinkedTitleFromBody, isMetaArticleTitle } from "../lib/timeline-meta";
import { sanitizeWikiText } from "../lib/timeline-text-hygiene";
import { parseDateFromText } from "../lib/timeline-dates";

function testHygiene() {
  assert.equal(sanitizeWikiText("Timeline of X ()"), "Timeline of X");
  assert.equal(sanitizeWikiText("D-Day[1]"), "D-Day");
  assert.equal(sanitizeWikiText("Paris (/ˈpærɪs/) falls"), "Paris falls");
  assert.equal(sanitizeWikiText("{{cite web|url=...}} Event happens"), "Event happens");
  assert.equal(sanitizeWikiText("1 September [ edit ] Polish POWs"), "1 September Polish POWs");
}

function testMetaDetection() {
  assert.ok(isMetaArticleTitle("Timeline of Sweden during World War II"));
  assert.ok(isMetaArticleTitle("List of battles of World War II"));
  assert.ok(isMetaArticleTitle("History of aviation"));
  assert.ok(!isMetaArticleTitle("Invasion of Poland"));
  assert.ok(!isMetaArticleTitle("Attack on Pearl Harbor"));

  const meta = extractLinkedTitleFromBody("Timeline of Sweden during World War II ()");
  assert.equal(meta, "Timeline of Sweden during World War II");
}

function testEventGate() {
  const wwiiRange = parseDateFromText("1939–1945")!;
  assert.ok(
    !passesEventGate({
      date: wwiiRange,
      title: "Timeline of Sweden during World War II",
      oneLiner: "Timeline of Sweden during World War II",
      body: "Timeline of Sweden during World War II",
    }),
  );

  const dday = parseDateFromText("6 June 1944")!;
  assert.ok(
    passesEventGate({
      date: dday,
      title: "Allied forces land in Normandy",
      oneLiner:
        "Allied troops stormed beaches in northern France, opening the Western Front against Nazi Germany.",
      body:
        "Allied troops stormed beaches in northern France, opening the Western Front against Nazi Germany.",
    }),
  );

  const pearl = parseDateFromText("7 December 1941")!;
  assert.ok(
    passesEventGate({
      date: pearl,
      title: "Japan attacks Pearl Harbor",
      oneLiner: "A surprise aerial assault on the U.S. naval base drew America into the war.",
      body: "A surprise aerial assault on the U.S. naval base drew America into the war.",
    }),
  );

  assert.ok(
    !passesEventGate({
      date: parseDateFromText("1945")!,
      title: "Germany surrenders",
      oneLiner: "Germany surrenders",
      body: "Germany surrenders ending the war in Europe.",
    }),
  );
}

function testWwiiFixtureLines() {
  const junkLines = [
    "1939–1945: Timeline of Sweden during World War II ()",
    "1939–1945 — List of World War II conferences",
    "1939–1945: History of the United Nations",
  ];

  for (const line of junkLines) {
    const datePart = line.match(/^[\d–—\-:\s]+/)?.[0] ?? "";
    const body = sanitizeWikiText(line.replace(datePart, "").replace(/^[\s–—\-:,]+/, ""));
    const date = parseDateFromText(line);
    assert.ok(isMetaArticleTitle(body) || extractLinkedTitleFromBody(body), `expected meta: ${line}`);
    if (date) {
      assert.ok(
        !passesEventGate({
          date,
          title: body,
          oneLiner: body,
          body,
        }),
        `junk line should fail gate: ${line}`,
      );
    }
  }

  const goodLine =
    "7 December 1941: Japan launches a surprise attack on the United States naval base at Pearl Harbor.";
  const goodDate = parseDateFromText(goodLine)!;
  const goodBody = sanitizeWikiText(
    goodLine.replace(goodDate.display, "").replace(/^[\s–—\-:,]+/, ""),
  );
  const goodTitle = "Japan attacks Pearl Harbor";
  assert.ok(!isMetaArticleTitle(goodTitle));
  assert.ok(
    passesEventGate({
      date: goodDate,
      title: goodTitle,
      oneLiner:
        "A surprise aerial assault on the U.S. naval base drew America into the war.",
      body: goodBody,
    }),
  );
}

testHygiene();
testMetaDetection();
testEventGate();
testWwiiFixtureLines();
console.log("timeline extract gate checks passed");
