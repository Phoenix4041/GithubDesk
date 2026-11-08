import type { GithubNotification } from "./api";

export const MIN_POLL_SECONDS = 60;
export const DEFAULT_POLL_SECONDS = 120;

export function newNotifications(
  items: readonly GithubNotification[],
  seen: ReadonlySet<string>,
): GithubNotification[] {
  return items.filter((item) => item.unread && !seen.has(item.id));
}

export function pollMilliseconds(seconds: number | null): number {
  const chosen = seconds ?? DEFAULT_POLL_SECONDS;
  return Math.max(MIN_POLL_SECONDS, chosen) * 1000;
}

export function unreadCount(items: readonly GithubNotification[] | undefined): number {
  return items ? items.filter((item) => item.unread).length : 0;
}

export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function summarize(items: readonly GithubNotification[], limit = 3): string {
  const shown = items.slice(0, limit).map((item) => `${item.repository.fullName}: ${item.subject.title}`);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join("\n")}\n+${rest}` : shown.join("\n");
}
