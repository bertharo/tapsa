export type TimeMarker = { yearSort: number; label: string };

/** Pick decade/century markers scaled to the event span. */
export function computeTimeMarkers(minYear: number, maxYear: number): TimeMarker[] {
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) return [];
  const span = maxYear - minYear;
  if (span <= 0) {
    return [{ yearSort: minYear, label: formatYear(minYear) }];
  }

  let step: number;
  if (span > 3000) step = 500;
  else if (span > 1200) step = 200;
  else if (span > 400) step = 100;
  else if (span > 120) step = 50;
  else if (span > 40) step = 20;
  else if (span > 15) step = 10;
  else step = 5;

  const start = Math.ceil(minYear / step) * step;
  const markers: TimeMarker[] = [];
  for (let y = start; y <= maxYear; y += step) {
    markers.push({ yearSort: y, label: formatYear(y) });
  }
  if (!markers.length) markers.push({ yearSort: minYear, label: formatYear(minYear) });
  return markers;
}

function formatYear(y: number): string {
  if (y < 0) return `${Math.abs(y)} BCE`;
  return String(y);
}
