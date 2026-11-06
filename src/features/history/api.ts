import { call } from "@/shared/lib/tauri-client";
import type { CommitDetail, CommitFile, CommitSummary, FileDiff } from "@/shared/types/git";

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
): Promise<FileDiff> {
  return call<FileDiff>("history_file_diff", { path, hash, filePath, oldPath });
}
