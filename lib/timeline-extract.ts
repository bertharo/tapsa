import type { ChronologicalSource, ResolvedChronology } from "./timeline-sources";
import type {
  EventTier,
  TimelineEra,
  TimelineEvent,
  TapsaTimeline,
  TopicType,
} from "./timeline-types";
import { MIN_TIMELINE_EVENTS, SPARSE_EVENT_THRESHOLD, TIMELINE_SCHEMA_VERSION } from "./timeline-types";
import { compareParsedDates, parseDateFromText, parseDateWithSectionContext, type ParsedDate } from "./timeline-dates";
import { deriveEras, findEraForSortKey } from "./timeline-eras";
import { classifyTopicType } from "./timeline-topic-type";
import { assignTiers, enrichEventSignals } from "./timeline-significance";
import { isBackgroundSection } from "./timeline-section-weight";
import { isJunkWikiExtract, passesEventGate } from "./timeline-event-gate";
import {
  capAncientEventFlood,
  selectEventsAcrossEras,
  trimErasToEvents,
} from "./timeline-event-select";
import { extractLinkedTitleFromBody, isMetaArticleTitle, shouldDescendMetaArticle } from "./timeline-meta";
import { sanitizeWikiText } from "./timeline-text-hygiene";
import { timelineCacheKey } from "./timeline-resolve";
import { titleToSlug } from "./slug";
import {
  fetchArticlePlainText,
  fetchSectionContent,
  fetchSections,
  rankCandidates,
} from "./wikipedia";
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
  return sanitizeWikiText(text);
}

function titleFromBody(body: string, preferredTitle?: string, maxWords = 8): string {
  if (preferredTitle && !isMetaArticleTitle(preferredTitle)) {
    const words = preferredTitle.trim().split(/\s+/);
    if (words.length <= maxWords) return preferredTitle.trim();
    return words.slice(0, maxWords).join(" ");
  }

  const cleaned = cleanEventText(body);
  const parenAlias = cleaned.match(/\(([A-Za-z][^)]{2,40})\)\s*\.?\s*$/);
  if (parenAlias && !isMetaArticleTitle(parenAlias[1])) return parenAlias[1].trim();

  let first = cleaned.split(/[.;]/)[0]?.trim() ?? cleaned;
  first = first.replace(/^\d{1,2}\s+[A-Za-z]+\s*/i, "").trim();
  first = first.replace(/^[A-Za-z]+\s+\d{1,2}\s*/i, "").trim();

  const words = first.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    const slice = words.slice(0, maxWords).join(" ");
    if (!DANGLING_TITLE_END.test(slice)) return slice;
    return words.slice(0, Math.max(3, maxWords - 1)).join(" ");
  }
  return first || cleaned.slice(0, 60);
}

const DANGLING_TITLE_END =
  /\b(the|a|an|in|on|at|of|and|or|to|for|with|under|during|her|his|their|its|before|after)\s*$/i;

function looksLikeListLine(body: string): boolean {
  const b = body.trim();
  if (b.length <= 220) return true;
  return /^\d{1,2}\s+[A-Za-z]/.test(b) || /^[A-Za-z]+\s+\d{4}/.test(b) || /^\d{4}\s/.test(b);
}

function pickBestEventLink(body: string, links: CandidateLink[]): CandidateLink | null {
  const focus = body.slice(0, 200).toLowerCase();
  let best: CandidateLink | null = null;
  let bestScore = 0;

  for (const link of links) {
    if (isMetaArticleTitle(link.title)) continue;
    const title = link.title.trim();
    if (title.length < 4 || title.split(/\s+/).length > 12) continue;

    const tokens = title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (!tokens.length) continue;
    const matched = tokens.filter((w) => focus.includes(w));
    if (matched.length < Math.min(2, tokens.length)) continue;

    let score = matched.length * 10 + title.length;
    if (/\b(battle|invasion|attack|raid|bombing|surrender|treaty|fall|massacre|holocaust)\b/i.test(title)) {
      score += 25;
    }
    if (/\b(world war|second world war|first world war)\b/i.test(title) && !focus.includes("world war")) {
      score -= 40;
    }
    if (/\bwreck\b/i.test(title) && /\b(mechanism|computer|computing|calculator|device|analog)\b/i.test(focus)) {
      score -= 30;
    }
    if (/\b(mechanism|computer|computing|calculator|microprocessor|transistor)\b/i.test(title)) {
      score += 15;
    }
    if (score > bestScore) {
      best = link;
      bestScore = score;
    }
  }

  return best;
}

function titleFromNarrativeSentence(body: string): string | null {
  const cleaned = cleanEventText(body);
  const including = cleaned.match(/\bincluding\s+(?:the\s+)?([A-Z][A-Za-z0-9'’\- ]{3,40})/);
  if (including) {
    const phrase = including[1].split(/[,.;]/)[0]?.trim();
    if (phrase && phrase.length >= 4) return phrase;
  }
  const invasion = cleaned.match(
    /\b((?:German|Japanese|Soviet|Allied|American|British)\s+(?:invasion|attack|occupation|annexation)\s+of\s+[A-Z][A-Za-z'’\- ]+)/i,
  );
  if (invasion) return invasion[1].trim().split(/[,.;]/)[0] ?? null;
  const attackOn = cleaned.match(/\b(?:attack|plan of the attack)\s+on\s+([A-Z][A-Za-z'’\- ]{3,40})/i);
  if (attackOn) {
    const target = attackOn[1]
      .trim()
      .split(/[,.;]/)[0]
      ?.split(/\s+to\s+/i)[0]
      ?.trim();
    if (target) return `Attack on ${target}`;
  }
  const verbLead = cleaned.match(
    /\b([A-Z][A-Za-z'’\-]+(?:\s+[A-Za-z'’\-]+){0,5})\s+(?:invades|invaded|attacks|attacked|declares war|surrenders|surrendered|falls|fell|lands|landed)\b/,
  );
  if (verbLead) return verbLead[1].trim();
  return null;
}

function focusIncludesPhrase(body: string, phrase: string): boolean {
  const focus = body.slice(0, 220).toLowerCase();
  const p = phrase.toLowerCase();
  if (focus.includes(p)) return true;
  const tokens = p.split(/\s+/).filter((w) => w.length > 3);
  return tokens.length >= 2 && tokens.every((w) => focus.includes(w));
}

function resolveEventFromLinks(
  ev: RawExtractedEvent,
  links: CandidateLink[],
  sourceArticleTitle: string,
): RawExtractedEvent {
  const sourceNorm = sourceArticleTitle.toLowerCase().replace(/_/g, " ");
  let title = ev.title;
  let wikiTitle = ev.wikiTitle;

  if (looksLikeListLine(ev.body)) {
    const link = pickBestEventLink(ev.body, links);
    if (link && focusIncludesPhrase(ev.body, link.title)) {
      title = titleFromBody(ev.body, link.title);
      wikiTitle = link.title.replace(/ /g, "_");
    } else if (/\bmechanism\b/i.test(ev.body)) {
      const mechanismLink = links.find(
        (l) =>
          /\bmechanism\b/i.test(l.title) &&
          !isMetaArticleTitle(l.title) &&
          focusIncludesPhrase(ev.body, l.title.replace(/ mechanism/i, "")),
      );
      if (mechanismLink) {
        title = mechanismLink.title;
        wikiTitle = mechanismLink.title.replace(/ /g, "_");
      }
    }
  } else {
    const narrative = titleFromNarrativeSentence(ev.body);
    if (narrative) title = narrative;
  }

  const oneLiner = buildOneLiner(title, ev.body);
  const candidate = { date: ev.date, title, oneLiner, body: ev.body, wikiTitle };
  if (
    !passesEventGate(candidate, { topicTitle: sourceNorm }) ||
    normalizeTitle(title) === normalizeTitle(sourceNorm)
  ) {
    return ev;
  }

  return {
    ...ev,
    title,
    oneLiner,
    wikiTitle,
    hasOwnArticle: wikiTitle.replace(/_/g, " ").toLowerCase() !== sourceNorm,
    linkCount: Math.max(ev.linkCount, wikiTitle !== ev.wikiTitle ? 1 : 0),
  };
}

function extractProseDatedEvents(
  text: string,
  defaultWikiTitle: string,
  inLead: boolean,
  sectionMeta?: { name: string; intro: string },
): RawExtractedEvent[] {
  const out: RawExtractedEvent[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const cleaned = cleanEventText(sentence);
    if (cleaned.length < 25 || isJunkWikiExtract(cleaned)) continue;
    if (isMetaArticleTitle(cleaned)) continue;

    const date = parseDateWithSectionContext(cleaned, sectionMeta?.name);
    if (!date || date.precision === "range" || date.precision === "century") continue;
    if (date.precision === "year" && date.sortKey > 0 && date.sortKey < 1800) {
      if (/\b(day|days|hour|hours|doi)\b/i.test(cleaned)) continue;
    }
    if (date.precision === "year" && date.sortKey > 0 && date.sortKey < 900) continue;

    const ev = buildRawEvent(date, cleaned, defaultWikiTitle, inLead, sectionMeta);
    if (ev) out.push(ev);
  }

  return out;
}

const SEMICOLON_LINE =
  /^[\s;]*(\d{1,4}\s*(?:BCE?|BC|CE|AD)?)\s*[–—\-:,]\s*(.+)$/i;

function buildOneLiner(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return title;
  const titleNorm = title.toLowerCase();
  let rest = trimmed;
  if (rest.toLowerCase().startsWith(titleNorm)) {
    rest = rest.slice(title.length).replace(/^[\s–—\-:,]+/, "").trim();
  }
  const candidate = rest.length >= 20 ? rest : trimmed;
  return candidate.slice(0, 160);
}

function buildRawEvent(
  date: ParsedDate,
  body: string,
  defaultWikiTitle: string,
  inLead: boolean,
  sectionMeta?: { name: string; intro: string },
  wikiTitleOverride?: string,
): RawExtractedEvent | null {
  if (body.length < 8 || JUNK_TITLE.test(body)) return null;
  const title = titleFromBody(body);
  const oneLiner = buildOneLiner(title, body);
  const wikiTitle = (wikiTitleOverride ?? defaultWikiTitle).replace(/ /g, "_");
  const candidate = { date, title, oneLiner, body, wikiTitle };
  if (!passesEventGate(candidate, { topicTitle: defaultWikiTitle.replace(/_/g, " ") })) {
    return null;
  }
  return {
    date,
    title,
    oneLiner,
    body,
    wikiTitle,
    inLead,
    linkCount: 0,
    hasOwnArticle: Boolean(wikiTitleOverride),
    sectionName: sectionMeta?.name,
    sectionIntro: sectionMeta?.intro,
  };
}

type LineExtractResult = {
  event: RawExtractedEvent | null;
  metaTitle: string | null;
};

function extractFromLine(
  line: string,
  defaultWikiTitle: string,
  inLead: boolean,
  sectionMeta?: { name: string; intro: string },
  allowMetaDescent = true,
): LineExtractResult {
  const trimmed = line.trim();
  if (trimmed.length < 12) return { event: null, metaTitle: null };

  const listMatch = trimmed.match(LINE_START_DATE) ?? trimmed.match(SEMICOLON_LINE);
  if (listMatch) {
    const date = parseDateFromText(listMatch[1]);
    const body = cleanEventText(listMatch[2]);
    if (!date || body.length < 8) return { event: null, metaTitle: null };

    if (allowMetaDescent) {
      const metaTitle = extractLinkedTitleFromBody(body);
      if (metaTitle) return { event: null, metaTitle };
      if (isMetaArticleTitle(body)) return { event: null, metaTitle: body };
    }

    return {
      event: buildRawEvent(date, body, defaultWikiTitle, inLead, sectionMeta),
      metaTitle: null,
    };
  }

  const date = parseDateFromText(trimmed);
  if (date) {
    const body = cleanEventText(trimmed.replace(date.display, "").replace(/^[\s–—\-:,]+/, ""));
    if (body.length < 12) return { event: null, metaTitle: null };

    if (allowMetaDescent) {
      const metaTitle = extractLinkedTitleFromBody(body);
      if (metaTitle) return { event: null, metaTitle };
      if (isMetaArticleTitle(body)) return { event: null, metaTitle: body };
    }

    return {
      event: buildRawEvent(date, body, defaultWikiTitle, inLead, sectionMeta),
      metaTitle: null,
    };
  }

  return { event: null, metaTitle: null };
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
    if (!date || sentence.length < 12 || isMetaArticleTitle(sentence)) continue;
    const ev = buildRawEvent(date, sentence, defaultWikiTitle, inLead, sectionMeta);
    if (ev) out.push(ev);
  }
  return out;
}

type SourceExtractResult = {
  events: RawExtractedEvent[];
  metaTitles: string[];
};

const NAV_SECTION =
  /^(see also|external links|references|notes|further reading|bibliography|main timelines|timelines|summary|overview)$/i;

function extractFromSource(
  source: ChronologicalSource,
  leadText: string,
  mainArticleTitle: string,
  allowMetaDescent = true,
): SourceExtractResult {
  const defaultWiki = source.articleTitle.replace(/ /g, "_");
  const events: RawExtractedEvent[] = [];
  const metaTitles: string[] = [];
  const allLinks: CandidateLink[] = [];

  const skipRootText =
    source.kind === "timeline_article" || source.sections.length >= 3;
  const leadChunk = skipRootText ? "" : source.text;
  const inLeadRoot =
    !skipRootText && leadText.length > 0 && leadChunk.slice(0, 200) === leadText.slice(0, 200);

  if (leadChunk) {
    for (const line of leadChunk.split(/\n+/)) {
      const { event, metaTitle } = extractFromLine(
        line,
        defaultWiki,
        inLeadRoot,
        undefined,
        allowMetaDescent,
      );
      if (event) events.push(event);
      if (metaTitle) metaTitles.push(metaTitle);
    }
    events.push(...extractInlineSentences(leadChunk, defaultWiki, inLeadRoot));
  }

  for (const section of source.sections) {
    if (NAV_SECTION.test(section.name.trim())) continue;
    if (isBackgroundSection(section.name)) continue;

    allLinks.push(...section.links);
    const meta = { name: section.name, intro: section.intro };
    const lines = section.text.split(/\n+/);
    for (const line of lines) {
      const { event, metaTitle } = extractFromLine(
        line,
        defaultWiki,
        false,
        meta,
        allowMetaDescent,
      );
      if (event) {
        events.push(
          resolveEventFromLinks(
            enrichEventSignals(event, section.links, mainArticleTitle),
            section.links,
            mainArticleTitle,
          ),
        );
      }
      if (metaTitle) metaTitles.push(metaTitle);
    }
    for (const ev of extractInlineSentences(section.text, defaultWiki, false, meta)) {
      events.push(
        resolveEventFromLinks(
          enrichEventSignals(ev, section.links, mainArticleTitle),
          section.links,
          mainArticleTitle,
        ),
      );
    }
    for (const ev of extractProseDatedEvents(section.text, defaultWiki, false, meta)) {
      events.push(
        resolveEventFromLinks(
          enrichEventSignals(ev, section.links, mainArticleTitle),
          section.links,
          mainArticleTitle,
        ),
      );
    }
  }

  const enriched = events.map((ev) => {
    const base = ev.sectionName ? ev : enrichEventSignals(ev, allLinks, mainArticleTitle);
    return resolveEventFromLinks(base, allLinks, mainArticleTitle);
  });

  return { events: enriched, metaTitles };
}

async function descendMetaArticles(
  metaTitles: string[],
  mainArticleTitle: string,
  seen: Set<string>,
): Promise<RawExtractedEvent[]> {
  const out: RawExtractedEvent[] = [];
  const unique = [...new Set(metaTitles.map((t) => t.trim()).filter(Boolean))];

  for (const metaTitle of unique) {
    const key = metaTitle.toLowerCase();
    if (seen.has(key) || !shouldDescendMetaArticle(metaTitle)) continue;
    seen.add(key);

    try {
      const text = await fetchArticlePlainText(metaTitle, 16000);
      if (text.length < 120) continue;

      const wikiSections = await fetchSections(metaTitle);
      const sections: ChronologicalSource["sections"] = [];
      for (const sec of wikiSections.slice(0, 12)) {
        const { text: st, links } = await fetchSectionContent(metaTitle, sec.index);
        if (st.length > 80) {
          const { extractSectionIntro } = await import("./timeline-eras");
          sections.push({
            name: sec.line,
            index: sec.index,
            text: st,
            intro: extractSectionIntro(st),
            links,
          });
        }
      }

      const childSource: ChronologicalSource = {
        kind: "timeline_article",
        articleTitle: metaTitle,
        text,
        sections,
      };
      const { events: childEvents } = extractFromSource(
        childSource,
        "",
        mainArticleTitle,
        false,
      );
      out.push(...childEvents);
    } catch {
      /* skip failed descent */
    }
  }

  return out;
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

  return dropRedundantWreckEvents(out);
}

/** When Wikipedia lists both "Antikythera mechanism" and "Antikythera wreck", keep the subject. */
function dropRedundantWreckEvents(events: RawExtractedEvent[]): RawExtractedEvent[] {
  return events.filter((ev) => {
    const wreckMatch = ev.title.match(/^(.+?)\s+wreck$/i);
    if (!wreckMatch) return true;
    const prefix = wreckMatch[1]!.toLowerCase();
    const hasSubject = events.some(
      (other) =>
        other !== ev &&
        other.title.toLowerCase().includes(prefix) &&
        !/\bwreck\b/i.test(other.title) &&
        !/^it was /i.test(other.title),
    );
    return !hasSubject;
  });
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
  if (isJunkWikiExtract(intro)) return undefined;
  if (/\bmain articles?:/i.test(intro)) return undefined;
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
  const metaQueue: string[] = [];
  const descended = new Set<string>();

  for (const source of chronology.sources) {
    const { events, metaTitles } = extractFromSource(
      source,
      chronology.lead,
      chronology.mainTitle,
    );
    raw.push(...events);
    metaQueue.push(...metaTitles);
  }

  const totalSections = chronology.sources.reduce((n, s) => n + s.sections.length, 0);
  if (chronology.lead.length > 80 && totalSections < 12) {
    const leadEvents = extractProseDatedEvents(
      chronology.lead,
      chronology.mainTitle.replace(/ /g, "_"),
      true,
    ).map((ev) => enrichEventSignals(ev, [], chronology.mainTitle));
    raw.push(...leadEvents);
  }

  if (metaQueue.length) {
    raw.push(...(await descendMetaArticles(metaQueue, chronology.mainTitle, descended)));
  }

  raw = raw.filter((ev) =>
    passesEventGate(
      { date: ev.date, title: ev.title, oneLiner: ev.oneLiner, body: ev.body },
      { topicTitle: chronology.mainTitle },
    ),
  );

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
  const capped = capAncientEventFlood(raw, topicType);
  const tiers = assignTiers(capped, eras);
  const selected = selectEventsAcrossEras(capped, eras, tiers);
  let events = toTimelineEvents(selected, eras, tiers);
  const trimmedEras = trimErasToEvents(eras, events);
  if (trimmedEras.length !== eras.length) {
    events = events.map((e) => {
      const era = findEraForSortKey(trimmedEras, e.sortKey);
      return era.id === e.eraId ? e : { ...e, eraId: era.id };
    });
  }

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
    events,
    eras: trimmedEras,
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
