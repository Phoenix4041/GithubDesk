import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import type { HistoryQuery } from "@/shared/types/git";
import { getCommitDetail, getCommitFileDiff, getCommitFiles, listHistory, prepareGraph } from "./api";

export const HISTORY_PAGE_SIZE = 200;

export function useHistory(repoPath: string, query: HistoryQuery, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...repoKeys.history(repoPath), query],
    queryFn: ({ pageParam, signal }) => listHistory(repoPath, query, pageParam, HISTORY_PAGE_SIZE, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < HISTORY_PAGE_SIZE ? undefined : allPages.length * HISTORY_PAGE_SIZE,
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useGraphPreparation(repoPath: string, wanted: boolean) {
  return useQuery({
    queryKey: [...repoKeys.history(repoPath), "graph-ready"],
    queryFn: async () => {
      await prepareGraph(repoPath);
      return true;
    },
    enabled: wanted,
    staleTime: Infinity,
  });
}

export function useCommitDetail(repoPath: string, hash: string | null) {
  return useQuery({
    queryKey: repoKeys.commitDetail(repoPath, hash ?? ""),
    queryFn: () => getCommitDetail(repoPath, hash ?? ""),
    enabled: hash !== null,
    staleTime: Infinity,
  });
}

export function useCommitFiles(repoPath: string, hash: string | null) {
  return useQuery({
    queryKey: repoKeys.commitFiles(repoPath, hash ?? ""),
    queryFn: () => getCommitFiles(repoPath, hash ?? ""),
    enabled: hash !== null,
    staleTime: Infinity,
  });
}

interface CommitFileTarget {
  hash: string;
  path: string;
  oldPath: string | null;
}

export function useCommitFileDiff(repoPath: string, target: CommitFileTarget | null, ignoreWhitespace: boolean) {
  return useQuery({
    queryKey: repoKeys.commitDiff(repoPath, target?.hash ?? "", target?.path ?? "", ignoreWhitespace),
    queryFn: () => {
      if (!target) {
        throw new Error("No file selected");
      }
      return getCommitFileDiff(repoPath, target.hash, target.path, target.oldPath, ignoreWhitespace);
    },
    enabled: target !== null,
    staleTime: Infinity,
  });
}
