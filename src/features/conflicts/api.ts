import { call } from "@/shared/lib/tauri-client";
import type { ConflictFile, ConflictSide, LineEnding } from "@/shared/types/git";

export function getConflict(path: string, filePath: string): Promise<ConflictFile> {
  return call<ConflictFile>("conflict_get", { path, filePath });
}

export function resolveConflict(path: string, filePath: string, content: string, lineEnding: LineEnding): Promise<void> {
  return call<void>("conflict_resolve", { path, filePath, content, lineEnding });
}

export function chooseConflictSide(path: string, filePath: string, side: ConflictSide): Promise<void> {
  return call<void>("conflict_choose_side", { path, filePath, side });
}
