import { fetchInstanceOfLabels, fetchWikidataId } from "./wikipedia-wikidata";

export const TOPIC_TYPES = [
  "PERSON",
  "ORGANIZATION",
  "EVENT",
  "PLACE",
  "CONCEPT",
  "CREATIVE_WORK",
] as const;

export type TopicType = (typeof TOPIC_TYPES)[number];

type TypeRule = { type: TopicType; pattern: RegExp };

/** Derived from Wikidata P31 labels — no topic-specific literals. */
const TYPE_RULES: TypeRule[] = [
  {
    type: "PERSON",
    pattern:
      /\b(?:human|person|monarch|royalty|noble|politician|scientist|writer|artist|athlete|composer|philosopher|religious leader|saint)\b/,
  },
  {
    type: "ORGANIZATION",
    pattern:
      /\b(?:organization|company|corporation|institution|university|sports league|association|political party|non-profit|military unit|government agency)\b/,
  },
  {
    type: "EVENT",
    pattern:
      /\b(?:event|battle|war|conflict|siege|revolution|election|treaty|conference|disaster|massacre|uprising|rebellion|invasion|expedition)\b/,
  },
  {
    type: "PLACE",
    pattern:
      /\b(?:country|city|town|village|state|province|region|continent|island|mountain|river|lake|ocean|sea|archipelago|territory|municipality|capital|settlement|geographic|location)\b/,
  },
  {
    type: "CREATIVE_WORK",
    pattern:
      /\b(?:film|album|song|book|novel|play|opera|painting|sculpture|video game|television series|comic|poem|artwork|literary work)\b/,
  },
  {
    type: "CONCEPT",
    pattern:
      /\b(?:technology|invention|scientific theory|field of study|discipline|method|technique|disease|medical condition|food|crop|plant|chemical compound|algorithm|software|protocol|standard)\b/,
  },
];

function matchTypes(blob: string): TopicType[] {
  const lower = blob.toLowerCase();
  return TYPE_RULES.filter((r) => r.pattern.test(lower)).map((r) => r.type);
}

function inferFromTitleStructure(title: string, hasBirthDeath: boolean): TopicType | undefined {
  if (hasBirthDeath) return "PERSON";
  if (/\b(war|battle|siege|revolution|treaty|massacre)\b/i.test(title)) return "EVENT";
  if (/\b(film|album|novel|opera|painting)\b/i.test(title)) return "CREATIVE_WORK";
  return undefined;
}

/** Classify topic type from Wikidata P31 + light structural signals. */
export async function classifyTopicType(
  title: string,
  options?: { hasBirthDeath?: boolean },
): Promise<TopicType> {
  const qid = await fetchWikidataId(title);
  if (qid) {
    const labels = await fetchInstanceOfLabels(qid);
    if (labels.length) {
      const blob = labels.join(" • ");
      const matched = [...new Set(matchTypes(blob))];
      if (matched.length === 1) return matched[0];
      if (matched.includes("PERSON")) return "PERSON";
      if (matched.includes("ORGANIZATION")) return "ORGANIZATION";
      if (matched.includes("EVENT")) return "EVENT";
      if (matched.includes("PLACE")) return "PLACE";
      if (matched.includes("CREATIVE_WORK")) return "CREATIVE_WORK";
      if (matched.length > 0) return "CONCEPT";
    }
  }

  const structural = inferFromTitleStructure(title, options?.hasBirthDeath ?? false);
  return structural ?? "CONCEPT";
}
