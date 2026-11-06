import { call } from "@/shared/lib/tauri-client";
import type {
  DiffSource,
  FileDiff,
  HeadCommit,
  LineSelection,
  StatusSnapshot,
} from "@/shared/types/git";

export function getStatus(path: string): Promise<StatusSnapshot> {
  return call<StatusSnapshot>("status_get", { path });
}

export function getFileDiff(
  path: string,
  filePath: string,
  originalPath: string | null,
  source: DiffSource,
): Promise<FileDiff> {
  return call<FileDiff>("diff_file", { path, filePath, originalPath, source });
}

export function stagePaths(path: string, paths: string[]): Promise<void> {
  return call<void>("changes_stage", { path, paths });
}

export function unstagePaths(path: string, paths: string[]): Promise<void> {
  return call<void>("changes_unstage", { path, paths });
}

export function discardChanges(path: string, tracked: string[], untracked: string[]): Promise<void> {
  return call<void>("changes_discard", { path, tracked, untracked });
}

export function stageSelection(path: string, diff: FileDiff, selections: LineSelection[]): Promise<void> {
  return call<void>("changes_stage_selection", { path, diff, selections });
}

export function unstageSelection(path: string, diff: FileDiff, selections: LineSelection[]): Promise<void> {
  return call<void>("changes_unstage_selection", { path, diff, selections });
}

export function getHeadCommit(path: string): Promise<HeadCommit | null> {
  return call<HeadCommit | null>("commit_head", { path });
}

export function createCommit(path: string, title: string, description: string, amend: boolean): Promise<string> {
  return call<string>("commit_create", { path, title, description, amend });
}

export function undoLastCommit(path: string): Promise<HeadCommit> {
  return call<HeadCommit>("commit_undo", { path });
}

export function abortMerge(path: string): Promise<void> {
  return call<void>("merge_abort", { path });
}
