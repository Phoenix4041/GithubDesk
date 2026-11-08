import type { RecentRepository } from "@/features/repositories/store";

export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

export interface RepoState {
  path: string;
  available: boolean;
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
}

export type RepoStatusKind = "missing" | "dirty" | "diverged" | "ahead" | "behind" | "clean";

export interface RecentRepoRow {
  path: string;
  name: string;
  lastOpened: number;
  branch: string | null;
  status: RepoStatusKind;
  ahead: number;
  behind: number;
}

export const HOME_RECENT_LIMIT = 6;

export function dayPeriod(hour: number): DayPeriod {
  if (hour >= 6 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 19) {
    return "afternoon";
  }
  if (hour >= 19 && hour < 24) {
    return "evening";
  }
  return "night";
}

export function displayName(account: { name: string | null; login: string } | null): string {
  if (!account) {
    return "";
  }
  const name = account.name?.trim() ?? "";
  const first = name.split(/\s+/)[0] ?? "";
  return first === "" ? account.login : first;
}

export function repoStatusKind(state: RepoState | undefined): RepoStatusKind {
  if (!state || !state.available) {
    return "missing";
  }
  if (state.dirty) {
    return "dirty";
  }
  if (state.ahead > 0 && state.behind > 0) {
    return "diverged";
  }
  if (state.ahead > 0) {
    return "ahead";
  }
  if (state.behind > 0) {
    return "behind";
  }
  return "clean";
}

export function recentPaths(recents: readonly RecentRepository[], limit: number = HOME_RECENT_LIMIT): string[] {
  return [...recents]
    .sort((left, right) => right.lastOpened - left.lastOpened)
    .slice(0, limit)
    .map((recent) => recent.path);
}

export function buildRecentRows(
  recents: readonly RecentRepository[],
  states: readonly RepoState[] | undefined,
  limit: number = HOME_RECENT_LIMIT,
): RecentRepoRow[] {
  const byPath = new Map((states ?? []).map((state) => [state.path, state] as const));
  return [...recents]
    .sort((left, right) => right.lastOpened - left.lastOpened)
    .slice(0, limit)
    .map((recent) => {
      const state = byPath.get(recent.path);
      return {
        path: recent.path,
        name: recent.name,
        lastOpened: recent.lastOpened,
        branch: state?.branch ?? null,
        status: states === undefined ? "clean" : repoStatusKind(state),
        ahead: state?.ahead ?? 0,
        behind: state?.behind ?? 0,
      };
    });
}
