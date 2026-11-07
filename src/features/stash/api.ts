import { call } from "@/shared/lib/tauri-client";
import type { CommitFile, FileDiff, Stash } from "@/shared/types/git";

export function listStashes(path: string): Promise<Stash[]> {
  return call<Stash[]>("stash_list", { path });
}

export function saveStash(path: string, message: string | null, includeUntracked: boolean): Promise<void> {
  return call<void>("stash_save", { path, message, includeUntracked });
}

export function applyStash(path: string, hash: string, pop: boolean): Promise<void> {
  return call<void>("stash_apply", { path, hash, pop });
}

export function dropStash(path: string, hash: string): Promise<void> {
  return call<void>("stash_drop", { path, hash });
}

export function branchFromStash(path: string, hash: string, name: string): Promise<void> {
  return call<void>("stash_branch", { path, hash, name });
}

export function getStashFiles(path: string, hash: string): Promise<CommitFile[]> {
  return call<CommitFile[]>("stash_changed_files", { path, hash });
}

export function getStashDiff(
  path: string,
  hash: string,
  filePath: string,
  oldPath: string | null,
  ignoreWhitespace: boolean,
): Promise<FileDiff> {
  return call<FileDiff>("stash_diff", { path, hash, filePath, oldPath, ignoreWhitespace });
}
