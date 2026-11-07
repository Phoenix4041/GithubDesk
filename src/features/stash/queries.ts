import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getStashDiff, getStashFiles, listStashes } from "./api";

export function useStashes(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.stashes(repoPath),
    queryFn: () => listStashes(repoPath),
  });
}

export function useStashFiles(repoPath: string, hash: string | null) {
  return useQuery({
    queryKey: repoKeys.stashFiles(repoPath, hash ?? ""),
    queryFn: () => getStashFiles(repoPath, hash ?? ""),
    enabled: hash !== null,
    staleTime: Infinity,
  });
}

interface StashFileTarget {
  hash: string;
  path: string;
  oldPath: string | null;
}

export function useStashFileDiff(repoPath: string, target: StashFileTarget | null, ignoreWhitespace: boolean) {
  return useQuery({
    queryKey: repoKeys.stashDiff(repoPath, target?.hash ?? "", target?.path ?? "", ignoreWhitespace),
    queryFn: () => {
      if (!target) {
        throw new Error("No file selected");
      }
      return getStashDiff(repoPath, target.hash, target.path, target.oldPath, ignoreWhitespace);
    },
    enabled: target !== null,
    staleTime: Infinity,
  });
}
