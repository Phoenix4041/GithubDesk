const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.345, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

export function formatRelativeTime(unixSeconds: number, language: string, nowMilliseconds = Date.now()): string {
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  let duration = unixSeconds - nowMilliseconds / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), "year");
}

export function formatDateTime(unixSeconds: number, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(unixSeconds * 1000),
  );
}
