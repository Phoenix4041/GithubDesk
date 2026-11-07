import { call } from "@/shared/lib/tauri-client";
import type { ReflogEntry, UndoPlan } from "@/shared/types/git";

export const REFLOG_LIMIT = 200;

export function listReflog(path: string, limit: number): Promise<ReflogEntry[]> {
  return call<ReflogEntry[]>("reflog_list", { path, limit });
}

export function getUndoPlan(path: string): Promise<UndoPlan | null> {
  return call<UndoPlan | null>("reflog_undo_plan", { path });
}

export function restoreHead(path: string, hash: string): Promise<void> {
  return call<void>("reflog_restore", { path, hash });
}

export function undoLastOperation(path: string, expectedCurrent: string): Promise<void> {
  return call<void>("reflog_undo", { path, expectedCurrent });
}
