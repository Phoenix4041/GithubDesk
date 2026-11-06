import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import type { DiffSource } from "@/shared/types/git";
import { getFileDiff, getHeadCommit, getStatus } from "./api";

export function useStatus(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.status(repoPath),
    queryFn: () => getStatus(repoPath),
  });
}

export function useHeadCommit(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.headCommit(repoPath),
    queryFn: () => getHeadCommit(repoPath),
  });
}

interface FileDiffTarget {
  path: string;
  originalPath: string | null;
  source: DiffSource;
}

export function useFileDiff(repoPath: string, target: FileDiffTarget | null) {
  return useQuery({
    queryKey: repoKeys.diff(repoPath, target?.source ?? "none", target?.path ?? ""),
    queryFn: () => {
      if (!target) {
        throw new Error("No file selected");
      }
      return getFileDiff(repoPath, target.path, target.originalPath, target.source);
    },
    enabled: target !== null,
  });
}
