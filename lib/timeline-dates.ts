export type DatePrecision = "day" | "month" | "year" | "century" | "range";

export type ParsedDate = {
  sortKey: number;
  precision: DatePrecision;
  display: string;
  /** Tie-break within the same calendar year (day-of-year or month). */
  subSort: number;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const ORDINAL = /\b(\d{1,2})(?:st|nd|rd|th)\b/i;

function isBce(raw: string): boolean {
  return /\b(bce?|bc)\b/i.test(raw);
}

function centuryMidYear(century: number, bce: boolean): number {
  const mid = (century - 1) * 100 + 50;
  return bce ? -mid : mid;
}

function dayOfYear(month: number, day: number): number {
  const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return days[month] + day;
}

function parseYearToken(raw: string, bce: boolean): ParsedDate | null {
  const y = Number.parseInt(raw.replace(/,/g, ""), 10);
  if (!Number.isFinite(y) || y < 1 || y > 9999) return null;
  const sortKey = bce ? -y : y;
  const display = bce ? `${y} BCE` : String(y);
  return { sortKey, precision: "year", display, subSort: 0 };
}

/** Parse the first date expression found in a string. */
export function parseDateFromText(text: string): ParsedDate | null {
  const t = text.trim();
  if (!t) return null;

  // Range: 1840–1870 or 1840-1870
  const range = t.match(/\b(\d{3,4})\s*[–—-]\s*(\d{3,4})\s*(BCE?|BC|CE|AD)?/i);
  if (range) {
    const bce = isBce(range[3] ?? "") || isBce(t);
    const a = Number.parseInt(range[1], 10);
    const b = Number.parseInt(range[2], 10);
    if (a && b) {
      const sortKey = bce ? -Math.min(a, b) : Math.min(a, b);
      const display = bce ? `${a}–${b} BCE` : `${a}–${b}`;
      return { sortKey, precision: "range", display, subSort: 0 };
    }
  }

  // Month Day, Year — e.g. January 15, 1891
  const mdy = t.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{3,4})\s*(BCE?|BC|CE|AD)?/i,
  );
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase().replace(/\./g, "")] ?? 0;
    const day = Number.parseInt(mdy[2], 10);
    const year = Number.parseInt(mdy[3], 10);
    const bce = isBce(mdy[4] ?? "") || isBce(t);
    if (month && day && year) {
      const sortKey = bce ? -year : year;
      const display = bce
        ? `${mdy[1]} ${day}, ${year} BCE`
        : `${mdy[1]} ${day}, ${year}`;
      return { sortKey, precision: "day", display, subSort: dayOfYear(month, day) };
    }
  }

  // Day Month Year — e.g. 15 January 1891
  const dmy = t.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{3,4})\s*(BCE?|BC|CE|AD)?/i,
  );
  if (dmy) {
    const day = Number.parseInt(dmy[1], 10);
    const month = MONTHS[dmy[2].toLowerCase().replace(/\./g, "")] ?? 0;
    const year = Number.parseInt(dmy[3], 10);
    const bce = isBce(dmy[4] ?? "") || isBce(t);
    if (month && day && year) {
      const sortKey = bce ? -year : year;
      const display = bce
        ? `${day} ${dmy[2]} ${year} BCE`
        : `${day} ${dmy[2]} ${year}`;
      return { sortKey, precision: "day", display, subSort: dayOfYear(month, day) };
    }
  }

  // Month Year — e.g. January 1891
  const my = t.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{3,4})\s*(BCE?|BC|CE|AD)?/i,
  );
  if (my) {
    const month = MONTHS[my[1].toLowerCase().replace(/\./g, "")] ?? 0;
    const year = Number.parseInt(my[2], 10);
    const bce = isBce(my[3] ?? "") || isBce(t);
    if (month && year) {
      const sortKey = bce ? -year : year;
      const display = bce ? `${my[1]} ${year} BCE` : `${my[1]} ${year}`;
      return { sortKey, precision: "month", display, subSort: month };
    }
  }

  // Century — e.g. 3rd century BC
  const century = t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+centur(?:y|ies)\s*(BCE?|BC|CE|AD)?/i);
  if (century) {
    const n = Number.parseInt(century[1], 10);
    const bce = isBce(century[2] ?? "") || isBce(t);
    if (n >= 1 && n <= 50) {
      const sortKey = centuryMidYear(n, bce);
      const display = bce ? `${n}${ordinalSuffix(n)} century BCE` : `${n}${ordinalSuffix(n)} century`;
      return { sortKey, precision: "century", display, subSort: 0 };
    }
  }

  // Year with optional circa
  const yearOnly = t.match(/\b(?:c\.|ca\.|circa|around|about|~)\s*(\d{3,4})\s*(BCE?|BC|CE|AD)?/i);
  if (yearOnly) {
    const parsed = parseYearToken(yearOnly[1], isBce(yearOnly[2] ?? "") || isBce(t));
    if (parsed) {
      parsed.display = `c. ${parsed.display}`;
      return parsed;
    }
  }

  const plainYear = t.match(/\b(\d{1,4})\s*(BCE?|BC|CE|AD)\b/i);
  if (plainYear) {
    return parseYearToken(plainYear[1], isBce(plainYear[2]));
  }

  const bareYear = t.match(/\b(\d{3,4})\b/);
  if (bareYear) {
    const y = Number.parseInt(bareYear[1], 10);
    if (y >= 1000 || (y >= 100 && y <= 999)) {
      return parseYearToken(bareYear[1], false);
    }
  }

  return null;
}

function ordinalSuffix(n: number): string {
  const s = ORDINAL.exec(String(n));
  if (s) return s[0].replace(String(n), "");
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

const PRECISION_RANK: Record<DatePrecision, number> = {
  day: 0,
  month: 1,
  year: 2,
  range: 3,
  century: 4,
};

/** Sort events: ascending by sortKey; within same year, finer precision first. */
export function compareParsedDates(a: ParsedDate, b: ParsedDate): number {
  if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
  const pr = PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision];
  if (pr !== 0) return pr;
  return a.subSort - b.subSort;
}

export function parsedDateToYearSort(d: ParsedDate): number {
  return d.sortKey;
}

const MONTH_PATTERN =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

/** Infer a full date using a year from the section heading when prose omits it. */
export function parseDateWithSectionContext(
  text: string,
  sectionName?: string,
): ParsedDate | null {
  const direct = parseDateFromText(text);
  if (direct) return direct;

  const sectionYear =
    sectionName?.match(/\((\d{3,4})\)/)?.[1] ??
    sectionName?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[1];
  if (!sectionYear) return null;

  const dayMonth = text.match(
    new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\b`, "i"),
  );
  if (dayMonth) {
    return parseDateFromText(`${dayMonth[1]} ${dayMonth[2]} ${sectionYear}`);
  }

  const monthYear = text.match(
    new RegExp(`\\b(${MONTH_PATTERN})\\s+(${sectionYear})\\b`, "i"),
  );
  if (monthYear) {
    return parseDateFromText(`${monthYear[1]} ${monthYear[2]}`);
  }

  return null;
}
