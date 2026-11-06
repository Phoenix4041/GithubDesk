import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getCommitDetail, getCommitFileDiff, getCommitFiles, listHistory } from "./api";

export const HISTORY_PAGE_SIZE = 200;

export function useHistory(repoPath: string) {
  return useInfiniteQuery({
    queryKey: repoKeys.history(repoPath),
    queryFn: ({ pageParam }) => listHistory(repoPath, null, pageParam, HISTORY_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < HISTORY_PAGE_SIZE ? undefined : allPages.length * HISTORY_PAGE_SIZE,
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

export function useCommitFileDiff(repoPath: string, target: CommitFileTarget | null) {
  return useQuery({
    queryKey: repoKeys.commitDiff(repoPath, target?.hash ?? "", target?.path ?? ""),
    queryFn: () => {
      if (!target) {
        throw new Error("No file selected");
      }
      return getCommitFileDiff(repoPath, target.hash, target.path, target.oldPath);
    },
    enabled: target !== null,
    staleTime: Infinity,
  });
}
