export const BACKGROUND_SYNC_MINUTES = { min: 2, max: 120, initial: 5 };

export function clampSyncMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return BACKGROUND_SYNC_MINUTES.initial;
  }
  return Math.min(BACKGROUND_SYNC_MINUTES.max, Math.max(BACKGROUND_SYNC_MINUTES.min, Math.round(value)));
}

export function syncIntervalMs(minutes: number): number {
  return clampSyncMinutes(minutes) * 60_000;
}

export interface FetchConditions {
  busy: boolean;
  hidden: boolean;
  online: boolean;
}

export function shouldFetchInBackground(conditions: FetchConditions): boolean {
  return !conditions.busy && !conditions.hidden && conditions.online;
}

export function pendingCount(unreadNotifications: number, behind: number): number {
  return Math.max(0, unreadNotifications) + (behind > 0 ? 1 : 0);
}
