import type { CandidateLink } from "./types";
import type { EventTier } from "./timeline-types";
import type { RawExtractedEvent } from "./timeline-extract";
import {
  actionTitleWeight,
  bodyNoisePenalty,
  topicDriftPenalty,
  isBackgroundSection,
  sectionLandmarkWeight,
} from "./timeline-section-weight";

/** Topic-agnostic significance signals — section context and action titles weighted. */
export function scoreSignificance(ev: RawExtractedEvent): number {
  let score = 0;
  if (ev.inLead) score += 2;
  if (ev.hasOwnArticle) score += 3;
  if (ev.linkCount >= 2) score += 2;
  else if (ev.linkCount === 1) score += 1;
  if (ev.body.length > 160) score += 1;
  else if (ev.body.length > 80) score += 0.5;
  if (ev.date.precision === "day") score += 2;
  else if (ev.date.precision === "month") score += 1;

  score += sectionLandmarkWeight(ev.sectionName);
  score += actionTitleWeight(ev.title);
  score += bodyNoisePenalty(ev.body);
  score += topicDriftPenalty(ev.title, ev.body);

  if (isBackgroundSection(ev.sectionName) && !ev.hasOwnArticle) score -= 4;

  return score;
}

function eraIdForEvent(ev: RawExtractedEvent, eras: { id: string; start: number; end: number }[]): string {
  const direct = eras.find((e) => ev.date.sortKey >= e.start && ev.date.sortKey <= e.end);
  if (direct) return direct.id;
  return eras.reduce((best, e) => {
    const dist = Math.min(Math.abs(ev.date.sortKey - e.start), Math.abs(ev.date.sortKey - e.end));
    const bestDist = Math.min(Math.abs(ev.date.sortKey - best.start), Math.abs(ev.date.sortKey - best.end));
    return dist < bestDist ? e : best;
  }).id;
}

function landmarkCandidates(events: RawExtractedEvent[]): RawExtractedEvent[] {
  const viable = events.filter((e) => scoreSignificance(e) > -4);
  return viable.length ? viable : events;
}

/**
 * Top ~35% become landmarks; sparse timelines promote all; every era gets ≥1 landmark.
 */
export function assignTiers(
  events: RawExtractedEvent[],
  eras: { id: string; start: number; end: number }[],
): Map<RawExtractedEvent, EventTier> {
  const tiers = new Map<RawExtractedEvent, EventTier>();
  if (!events.length) return tiers;

  if (events.length <= 4) {
    for (const ev of events) tiers.set(ev, "landmark");
    return tiers;
  }

  const pool = landmarkCandidates(events);
  const scored = pool
    .map((ev) => ({ ev, score: scoreSignificance(ev) }))
    .sort((a, b) => b.score - a.score || b.ev.body.length - a.ev.body.length);

  const landmarkQuota = Math.max(
    2,
    Math.min(Math.ceil(events.length * 0.35), events.length - 1),
  );
  const landmarks = new Set<RawExtractedEvent>(
    scored.slice(0, landmarkQuota).map((s) => s.ev),
  );

  for (const era of eras) {
    const inEra = events.filter((e) => eraIdForEvent(e, eras) === era.id);
    if (!inEra.length) continue;
    if (inEra.some((e) => landmarks.has(e))) continue;
    const eraPool = landmarkCandidates(inEra);
    const best = [...eraPool].sort((a, b) => scoreSignificance(b) - scoreSignificance(a))[0];
    landmarks.add(best);
  }

  for (const ev of events) {
    tiers.set(ev, landmarks.has(ev) ? "landmark" : "context");
  }
  return tiers;
}

export function enrichEventSignals(
  ev: RawExtractedEvent,
  sectionLinks: CandidateLink[],
  mainArticleTitle: string,
): RawExtractedEvent {
  const bodyLower = ev.body.toLowerCase();
  let linkCount = 0;
  let hasOwnArticle = false;
  const mainNorm = mainArticleTitle.toLowerCase().replace(/_/g, " ");

  for (const link of sectionLinks) {
    const t = link.title.toLowerCase();
    if (t.length < 3) continue;
    if (bodyLower.includes(t) || bodyLower.includes(t.slice(0, Math.min(t.length, 12)))) {
      linkCount += 1;
      if (t !== mainNorm && link.title.replace(/\s+/g, "_") !== ev.wikiTitle) {
        hasOwnArticle = true;
      }
    }
  }

  if (ev.wikiTitle.replace(/_/g, " ").toLowerCase() !== mainNorm) {
    hasOwnArticle = true;
  }

  return { ...ev, linkCount, hasOwnArticle };
}
