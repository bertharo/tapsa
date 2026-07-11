/** Era accent colors — assign in order, cycle if >5 eras. */
export const ERA_PALETTE = [
  "#c9a24b", // dusty gold
  "#45b8be", // warm teal
  "#d1603d", // terracotta
  "#8a7bdc", // violet
  "#7aa05a", // sage
] as const;

export const TIMELINE_TERRACOTTA = "#d1603d";

export function eraColor(index: number): string {
  return ERA_PALETTE[index % ERA_PALETTE.length];
}

export function eraColorMap(eras: { id: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  eras.forEach((e, i) => map.set(e.id, eraColor(i)));
  return map;
}
