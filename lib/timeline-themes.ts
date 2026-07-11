/** Visual palette for era bands — cycles if more eras than themes. */
export const ERA_THEMES = [
  { bg: "#f5efe6", accent: "#8b6914" },
  { bg: "#eef2e8", accent: "#4a6741" },
  { bg: "#e8eef4", accent: "#3d5a80" },
  { bg: "#f0ece8", accent: "#6b4c3b" },
  { bg: "#ebeaf5", accent: "#4a3d80" },
  { bg: "#e8f4f0", accent: "#2d6a5a" },
] as const;

export function eraTheme(index: number) {
  return ERA_THEMES[index % ERA_THEMES.length];
}

export const CATEGORY_LABELS: Record<string, string> = {
  war: "War",
  invention: "Invention",
  person: "Person",
  culture: "Culture",
  economy: "Economy",
  science: "Science",
};

export function yearSpan(min: number, max: number): number {
  return Math.max(max - min, 1);
}

/** Map a year to horizontal position (px) on the track. */
export function yearToX(year: number, minYear: number, maxYear: number, trackWidth: number): number {
  return ((year - minYear) / yearSpan(minYear, maxYear)) * trackWidth;
}

export function formatDisplayYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : `${year}`;
}
