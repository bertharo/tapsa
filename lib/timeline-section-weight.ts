/** Topic-agnostic section and title signals for landmark tiering. */

const BACKGROUND_SECTION =
  /\b(background|causes|aftermath|start and end|casualties|genocide|impact|legacy|assessment|effects|consequences|historiography|war crimes|demographics|pre-?war)\b/i;

const WAR_SECTION =
  /\b(war breaks out|course of|battle|battles|invasion|campaign|offensive|siege|pacific|eastern front|western front|north africa|mediterranean|europe \(\d|air war|naval)\b/i;

const ACTION_TITLE =
  /\b(invasion|battle|attack|raid|bombing|bombings|surrender|fall of|landings?|declaration of war|pearl harbor|normandy|stalingrad|hiroshima|holocaust)\b/i;

const BODY_NOISE =
  /\b(casualties main article|prisoner identity|forced labour|genocide, war crimes|main article:|see also:|representative democracy|league of nations was established)\b/i;

/** Positive = more landmark-worthy; negative = background noise. */
export function sectionLandmarkWeight(sectionName?: string): number {
  if (!sectionName) return 0;
  const s = sectionName.toLowerCase();
  if (BACKGROUND_SECTION.test(s)) return -8;
  if (WAR_SECTION.test(s)) return 6;
  return 0;
}

export function actionTitleWeight(title: string): number {
  return ACTION_TITLE.test(title) ? 5 : 0;
}

export function bodyNoisePenalty(body: string): number {
  return BODY_NOISE.test(body) ? -10 : 0;
}

export function isBackgroundSection(sectionName?: string): boolean {
  if (!sectionName) return false;
  return BACKGROUND_SECTION.test(sectionName.toLowerCase());
}
