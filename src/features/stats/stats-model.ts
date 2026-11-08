import type { DayActivity } from "./api";

export interface CalendarDay {
  date: string;
  commits: number;
  level: 0 | 1 | 2 | 3 | 4;
  inRange: boolean;
}

export interface Calendar {
  weeks: CalendarDay[][];
  total: number;
  busiest: DayActivity | null;
}

const DAYS_SHOWN = 365;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function levelFor(commits: number, max: number): CalendarDay["level"] {
  if (commits <= 0 || max <= 0) {
    return 0;
  }
  const level = Math.ceil((commits / max) * 4);
  if (level >= 4) {
    return 4;
  }
  if (level <= 1) {
    return 1;
  }
  return level === 2 ? 2 : 3;
}

export function buildCalendar(activity: DayActivity[], today: Date): Calendar {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const first = new Date(end);
  first.setDate(first.getDate() - (DAYS_SHOWN - 1));
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const firstKey = dayKey(first);

  const counts = new Map(activity.map((day) => [day.date, day.commits]));
  const inWindow = activity.filter((day) => day.date >= firstKey && day.date <= dayKey(end));
  const max = inWindow.reduce((highest, day) => Math.max(highest, day.commits), 0);
  const total = inWindow.reduce((sum, day) => sum + day.commits, 0);
  const busiest = inWindow.reduce<DayActivity | null>(
    (best, day) => (best === null || day.commits > best.commits ? day : best),
    null,
  );

  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: CalendarDay[] = [];
    for (let weekday = 0; weekday < 7 && cursor <= end; weekday += 1) {
      const key = dayKey(cursor);
      const inRange = key >= firstKey;
      const commits = inRange ? (counts.get(key) ?? 0) : 0;
      week.push({ date: key, commits, level: levelFor(commits, max), inRange });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, total, busiest };
}

export function folderLabel(path: string): string {
  return path === "" ? "/" : path;
}
