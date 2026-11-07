import { call } from "@/shared/lib/tauri-client";
import type { CommitDetail, CommitFile, CommitSummary, FileDiff, ResetMode } from "@/shared/types/git";

export function listHistory(
  path: string,
  revision: string | null,
  skip: number,
  limit: number,
): Promise<CommitSummary[]> {
  return call<CommitSummary[]>("history_list", { path, revision, skip, limit });
}

export function getCommitDetail(path: string, hash: string): Promise<CommitDetail | null> {
  return call<CommitDetail | null>("history_detail", { path, hash });
}

export function getCommitFiles(path: string, hash: string): Promise<CommitFile[]> {
  return call<CommitFile[]>("history_files", { path, hash });
}

export function getCommitFileDiff(
  path: string,
  hash: string,
  filePath: string,
  oldPath: string | null,
  ignoreWhitespace: boolean,
): Promise<FileDiff> {
  return call<FileDiff>("history_file_diff", { path, hash, filePath, oldPath, ignoreWhitespace });
}

export function cherryPickCommits(path: string, hashes: string[]): Promise<void> {
  return call<void>("commit_cherry_pick", { path, hashes });
}

export function revertCommit(path: string, hash: string, mainline: number | null): Promise<void> {
  return call<void>("commit_revert", { path, hash, mainline });
}

export function resetToCommit(path: string, hash: string, mode: ResetMode): Promise<void> {
  return call<void>("commit_reset", { path, hash, mode });
}

export function checkoutCommit(path: string, hash: string): Promise<void> {
  return call<void>("commit_checkout", { path, hash });
}
