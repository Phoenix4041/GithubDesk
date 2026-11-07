import { buildHistoryQuery, EMPTY_FILTER_FIELDS } from "@/features/history/history-query";
import { listHistory } from "@/features/history/api";
import { call } from "@/shared/lib/tauri-client";
import type { CommitFile, CommitSummary, CompareSummary, FileDiff } from "@/shared/types/git";

export const COMPARE_COMMIT_LIMIT = 200;

export function getCompareSummary(path: string, base: string, head: string): Promise<CompareSummary> {
  return call<CompareSummary>("compare_get_summary", { path, base, head });
}

export function getCompareFiles(path: string, base: string, head: string): Promise<CommitFile[]> {
  return call<CommitFile[]>("compare_changed_files", { path, base, head });
}

export function getCompareDiff(
  path: string,
  base: string,
  head: string,
  filePath: string,
  oldPath: string | null,
  ignoreWhitespace: boolean,
): Promise<FileDiff> {
  return call<FileDiff>("compare_diff", { path, base, head, filePath, oldPath, ignoreWhitespace });
}

export function listRangeCommits(path: string, range: string): Promise<CommitSummary[]> {
  const query = { ...buildHistoryQuery(EMPTY_FILTER_FIELDS, false), revision: range };
  return listHistory(path, query, 0, COMPARE_COMMIT_LIMIT);
}
