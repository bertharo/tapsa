import type { ChronologicalSource, ResolvedChronology } from "./timeline-sources";
import type {
  EventCategory,
  EventTier,
  TimelineEra,
  TimelineEvent,
  TapsaTimeline,
  TopicType,
} from "./timeline-types";
import { MIN_TIMELINE_EVENTS, SPARSE_EVENT_THRESHOLD, TIMELINE_SCHEMA_VERSION } from "./timeline-types";
import { compareParsedDates, parseDateFromText, type ParsedDate } from "./timeline-dates";
import { deriveEras, findEraForSortKey } from "./timeline-eras";
import { classifyTopicType } from "./timeline-topic-type";
import { timelineCacheKey } from "./timeline-resolve";
import { titleToSlug } from "./slug";
import { rankCandidates } from "./wikipedia";
import type { CandidateLink } from "./types";

export type RawExtractedEvent = {
  date: ParsedDate;
  title: string;
  oneLiner: string;
  body: string;
  wikiTitle: string;
  inLead: boolean;
  linkCount: number;
  hasOwnArticle: boolean;
  sectionName?: string;
  sectionIntro?: string;
};

const JUNK_TITLE =
  /^(chapter|section|part|unit|module|appendix|references|see also|external links)\s*[\d.:]*$/i;

const LINE_START_DATE =
  /^[\s•*–—-]*(\d{1,4}\s*(?:BCE?|BC|CE|AD)?|\d{1,2}(?:st|nd|rd|th)\s+centur(?:y|ies)(?:\s*(?:BCE?|BC))?)\s*[–—\-:,]\s*(.+)$/i;

const INLINE_DATE =
  /(?:^|[.!?]\s+)(?:In|On|By|During|Around|c\.|ca\.|circa)\s+([^,;.]{4,80}?)(?:,|\s+)([^.]{12,200}\.)/gi;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normalizeTitle(b).split(" ").filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

function cleanEventText(text: string): string {
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s•*–—-]+/, "")
    .trim();
}

function titleFromBody(body: string, maxWords = 8): string {
  const cleaned = cleanEventText(body);
  const first = cleaned.split(/[.;]/)[0]?.trim() ?? cleaned;
  const words = first.split(/\s+/).slice(0, maxWords);
  return words.join(" ") || cleaned.slice(0, 60);
}

function inferCategory(text: string): EventCategory {
  const t = text.toLowerCase();
  if (/\b(theorem|equation|proof|mathematic)\b/.test(t)) return "MATHEMATICS";
  if (/\b(planet|star|galaxy|comet|orbit|telescope)\b/.test(t)) return "ASTRONOMY";
  if (/\b(physic|force|energy|quantum|particle)\b/.test(t)) return "PHYSICS";
  if (/\b(experiment|discovery|hypothesis|theory|research)\b/.test(t)) return "SCIENCE";
  if (/\b(invent|engineer|device|machine|software|computer)\b/.test(t)) return "TECHNOLOGY";
  if (/\b(philosoph|ethic|logic)\b/.test(t)) return "PHILOSOPHY";
  if (/\b(observe|survey|measure|record)\b/.test(t)) return "OBSERVATION";
  return "CULTURE";
}

const SEMICOLON_LINE =
  /^[\s;]*(\d{1,4}\s*(?:BCE?|BC|CE|AD)?)\s*[–—\-:,]\s*(.+)$/i;

function extractFromLine(
  line: string,
  defaultWikiTitle: string,
  inLead: boolean,
  sectionMeta?: { name: string; intro: string },
): RawExtractedEvent | null {
  const trimmed = line.trim();
  if (trimmed.length < 12) return null;

  const listMatch = trimmed.match(LINE_START_DATE) ?? trimmed.match(SEMICOLON_LINE);
  if (listMatch) {
    const date = parseDateFromText(listMatch[1]);
    const body = cleanEventText(listMatch[2]);
    if (!date || body.length < 8 || JUNK_TITLE.test(body)) return null;
    const title = titleFromBody(body);
    return {
      date,
      title,
      oneLiner: body.slice(0, 160),
      body,
      wikiTitle: defaultWikiTitle.replace(/ /g, "_"),
      inLead,
      linkCount: 0,
      hasOwnArticle: false,
      sectionName: sectionMeta?.name,
      sectionIntro: sectionMeta?.intro,
    };
  }

  const date = parseDateFromText(trimmed);
  if (date) {
    const body = cleanEventText(trimmed.replace(date.display, "").replace(/^[\s–—\-:,]+/, ""));
    if (body.length < 12 || JUNK_TITLE.test(body)) return null;
    const title = titleFromBody(body);
    return {
      date,
      title,
      oneLiner: body.slice(0, 160),
      body,
      wikiTitle: defaultWikiTitle.replace(/ /g, "_"),
      inLead,
      linkCount: 0,
      hasOwnArticle: false,
      sectionName: sectionMeta?.name,
      sectionIntro: sectionMeta?.intro,
    };
  }

  return null;
}

function extractInlineSentences(
  text: string,
  defaultWikiTitle: string,
  inLead: boolean,
  sectionMeta?: { name: string; intro: string },
): RawExtractedEvent[] {
  const out: RawExtractedEvent[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_DATE.source, INLINE_DATE.flags);
  while ((m = re.exec(text))) {
    const dateStr = m[1];
    const sentence = cleanEventText(m[2]);
    const date = parseDateFromText(dateStr);
    if (!date || sentence.length < 12 || JUNK_TITLE.test(sentence)) continue;
    out.push({
      date,
      title: titleFromBody(sentence),
      oneLiner: sentence.slice(0, 160),
      body: sentence,
      wikiTitle: defaultWikiTitle.replace(/ /g, "_"),
      inLead,
      linkCount: 0,
      hasOwnArticle: false,
      sectionName: sectionMeta?.name,
      sectionIntro: sectionMeta?.intro,
    });
  }
  return out;
}

function extractFromSource(
  source: ChronologicalSource,
  leadText: string,
): RawExtractedEvent[] {
  const defaultWiki = source.articleTitle.replace(/ /g, "_");
  const events: RawExtractedEvent[] = [];

  const leadChunk = source.text;
  const inLeadRoot = leadText.length > 0 && leadChunk.slice(0, 200) === leadText.slice(0, 200);
  for (const line of leadChunk.split(/\n+/)) {
    const ev = extractFromLine(line, defaultWiki, inLeadRoot);
    if (ev) events.push(ev);
  }
  events.push(...extractInlineSentences(leadChunk, defaultWiki, inLeadRoot));

  for (const section of source.sections) {
    const meta = { name: section.name, intro: section.intro };
    const lines = section.text.split(/\n+/);
    for (const line of lines) {
      const ev = extractFromLine(line, defaultWiki, false, meta);
      if (ev) events.push(ev);
    }
    events.push(...extractInlineSentences(section.text, defaultWiki, false, meta));
  }

  return events;
}

export function dedupeEvents(events: RawExtractedEvent[]): RawExtractedEvent[] {
  const sorted = [...events].sort((a, b) => compareParsedDates(a.date, b.date));
  const out: RawExtractedEvent[] = [];

  for (const ev of sorted) {
    const norm = normalizeTitle(ev.title);
    const yearBucket = ev.date.sortKey;
    const dup = out.find((existing) => {
      if (existing.date.sortKey !== yearBucket) return false;
      const existingNorm = normalizeTitle(existing.title);
      if (existingNorm === norm) return true;
      return tokenOverlap(existing.title, ev.title) >= 0.8;
    });
    if (!dup) out.push(ev);
  }

  return out;
}

function scoreSignificance(ev: RawExtractedEvent): number {
  let score = 0;
  if (ev.inLead) score += 4;
  if (ev.hasOwnArticle) score += 3;
  if (ev.linkCount > 2) score += 2;
  if (ev.body.length > 120) score += 2;
  if (ev.date.precision === "day") score += 1;
  return score;
}

function assignTiers(events: RawExtractedEvent[]): Map<RawExtractedEvent, EventTier> {
  const scores = events.map((e) => scoreSignificance(e));
  const sorted = [...scores].sort((a, b) => b - a);
  const cutoff = sorted[Math.max(0, Math.floor(events.length * 0.4) - 1)] ?? 0;
  const tiers = new Map<RawExtractedEvent, EventTier>();
  for (const ev of events) {
    tiers.set(ev, scoreSignificance(ev) >= cutoff ? "landmark" : "context");
  }
  return tiers;
}

function transitionalTextFor(
  ev: RawExtractedEvent,
  prevLandmark: RawExtractedEvent | null,
  eraId: string,
  prevEraId: string | null,
): string | undefined {
  if (!prevLandmark || eraId !== prevEraId) return undefined;
  const intro = ev.sectionIntro?.trim();
  if (!intro || intro.length < 20) return undefined;
  if (normalizeTitle(intro) === normalizeTitle(ev.oneLiner)) return undefined;
  if (normalizeTitle(intro) === normalizeTitle(prevLandmark.oneLiner)) return undefined;
  return intro.slice(0, 220);
}

function toTimelineEvents(
  raw: RawExtractedEvent[],
  eras: TimelineEra[],
  tiers: Map<RawExtractedEvent, EventTier>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let prevLandmark: RawExtractedEvent | null = null;
  let prevEraId: string | null = null;

  for (const ev of raw) {
    const era = findEraForSortKey(eras, ev.date.sortKey);
    const tier = tiers.get(ev) ?? "context";
    const wikiTitle = ev.wikiTitle.replace(/ /g, "_");
    const slug = titleToSlug(wikiTitle.replace(/_/g, " "));
    const title = ev.title;

    const transitionalText =
      tier === "landmark"
        ? transitionalTextFor(ev, prevLandmark, era.id, prevEraId)
        : undefined;

    events.push({
      id: `evt-${ev.date.sortKey}-${slug}-${normalizeTitle(title).slice(0, 24)}`,
      yearDisplay: ev.date.display,
      yearSort: ev.date.sortKey,
      sortKey: ev.date.sortKey,
      precision: ev.date.precision,
      title,
      oneLiner: ev.oneLiner,
      body: ev.body,
      category: inferCategory(ev.body),
      eraId: era.id,
      tier,
      transitionalText,
      wikiTitle,
      wikipediaSlug: slug,
      image: null,
    });

    if (tier === "landmark") {
      prevLandmark = ev;
      prevEraId = era.id;
    }
  }

  return events;
}

async function pickAdjacentTopics(
  mainTitle: string,
  links: CandidateLink[],
): Promise<{ title: string; slug: string }[]> {
  const ranked = await rankCandidates(links, titleToSlug(mainTitle));
  return ranked.slice(0, 3).map((l) => ({ title: l.title, slug: l.slug }));
}

export type ExtractTimelineInput = {
  requestedSlug: string;
  displayTitle: string;
  chronology: ResolvedChronology;
  topicType?: TopicType;
};

export async function extractTimelineFromSources(
  input: ExtractTimelineInput,
): Promise<TapsaTimeline> {
  const { chronology, displayTitle, requestedSlug } = input;
  let raw: RawExtractedEvent[] = [];

  for (const source of chronology.sources) {
    raw.push(...extractFromSource(source, chronology.lead));
  }

  raw = dedupeEvents(raw);
  raw.sort((a, b) => compareParsedDates(a.date, b.date));

  const topicType =
    input.topicType ??
    (await classifyTopicType(chronology.mainTitle, {
      hasBirthDeath: raw.some((e) => /\b(born|birth|died|death)\b/i.test(e.body)),
    }));

  const sparse = raw.length < SPARSE_EVENT_THRESHOLD;
  if (raw.length === 0) {
    throw new Error("No dateable events extracted.");
  }

  const eventPoints = raw.map((e) => ({
    sortKey: e.date.sortKey,
    precision: e.date.precision,
    sectionName: e.sectionName,
  }));

  const eras = deriveEras({
    sections: chronology.eraSections.map((s) => ({
      name: s.name,
      text: s.text,
      intro: s.intro,
    })),
    events: eventPoints,
    topicType,
  });
  const tiers = assignTiers(raw);
  const events = toTimelineEvents(raw, eras, tiers);

  const orientation =
    chronology.lead.split(/[.!?]/)[0]?.trim().slice(0, 220) ||
    `The history of ${displayTitle}.`;

  let adjacentTopics: { title: string; slug: string }[] | undefined;
  if (sparse) {
    const { fetchSectionContent } = await import("./wikipedia");
    const sections = chronology.sources[0]?.sections ?? [];
    const links: CandidateLink[] = [];
    for (const sec of sections.slice(0, 3)) {
      const { links: secLinks } = await fetchSectionContent(
        chronology.mainTitle,
        sec.index,
      );
      links.push(...secLinks);
    }
    adjacentTopics = await pickAdjacentTopics(chronology.mainTitle, links);
  }

  const cacheKey = timelineCacheKey(chronology.mainTitle, chronology.revisionId);

  return {
    slug: requestedSlug,
    title: displayTitle.trim() || chronology.mainTitle,
    topic: chronology.mainTitle,
    events: events.slice(0, 40),
    eras,
    sourceUrl: chronology.sourceUrl,
    generatedAt: new Date().toISOString(),
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    origin: "wikipedia",
    wikiTitle: chronology.mainTitle,
    revisionId: chronology.revisionId,
    cacheKey,
    topicType,
    orientation,
    sparse,
    adjacentTopics,
  };
}

export function isTimelineSufficient(timeline: TapsaTimeline): boolean {
  return timeline.sparse || timeline.events.length >= MIN_TIMELINE_EVENTS;
}
