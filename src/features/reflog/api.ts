import { call } from "@/shared/lib/tauri-client";
import type { ReflogEntry, UndoPlan, UndoPreview } from "@/shared/types/git";

export const REFLOG_LIMIT = 200;

export function listReflog(path: string, limit: number): Promise<ReflogEntry[]> {
  return call<ReflogEntry[]>("reflog_list", { path, limit });
}

export function listReflogRef(path: string, reference: string, limit: number): Promise<ReflogEntry[]> {
  return call<ReflogEntry[]>("reflog_list_ref", { path, reference, limit });
}

export function listReflogRefs(path: string): Promise<string[]> {
  return call<string[]>("reflog_refs", { path });
}

export function getUndoPlan(path: string): Promise<UndoPlan | null> {
  return call<UndoPlan | null>("reflog_undo_plan", { path });
}

export function getUndoPreview(path: string): Promise<UndoPreview | null> {
  return call<UndoPreview | null>("reflog_undo_preview", { path });
}

export function restoreHead(path: string, hash: string): Promise<void> {
  return call<void>("reflog_restore", { path, hash });
}

export function undoLastOperation(path: string, expectedCurrent: string, stashFirst: boolean): Promise<void> {
  return call<void>("reflog_undo", { path, expectedCurrent, stashFirst });
}

export function recoverCommit(path: string, name: string, hash: string): Promise<void> {
  return call<void>("reflog_recover", { path, name, hash });
}
