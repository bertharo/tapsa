const BUILDING_KEY = "tapsa:timeline:building";

export function markTimelineBuilding(title: string): void {
  try {
    sessionStorage.setItem(BUILDING_KEY, title.trim());
  } catch {
    /* ignore */
  }
}

export function readTimelineBuilding(): string | null {
  try {
    return sessionStorage.getItem(BUILDING_KEY);
  } catch {
    return null;
  }
}

export function clearTimelineBuilding(): void {
  try {
    sessionStorage.removeItem(BUILDING_KEY);
  } catch {
    /* ignore */
  }
}

export function timelineUrl(slug: string, query: string): string {
  return `/timeline/${encodeURIComponent(slug)}?q=${encodeURIComponent(query)}`;
}
