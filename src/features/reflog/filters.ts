import type { ReflogEntry } from "@/shared/types/git";

export const HEAD_REFERENCE = "HEAD";

const SECONDS_PER_DAY = 24 * 60 * 60;

function startOfDay(value: string): number | null {
  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed / 1000;
}

export function filterByDate(entries: ReflogEntry[], from: string, to: string): ReflogEntry[] {
  const lower = from ? startOfDay(from) : null;
  const upperStart = to ? startOfDay(to) : null;
  const upper = upperStart === null ? null : upperStart + SECONDS_PER_DAY;
  return entries.filter((entry) => (lower === null || entry.time >= lower) && (upper === null || entry.time < upper));
}
