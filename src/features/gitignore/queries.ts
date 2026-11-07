import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listIgnoredTracked, readIgnoreFile } from "./api";

export function useIgnoreFile(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.ignoreFile(repoPath),
    queryFn: () => readIgnoreFile(repoPath),
    staleTime: 0,
  });
}

export function useIgnoredTracked(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.ignoredTracked(repoPath),
    queryFn: () => listIgnoredTracked(repoPath),
    enabled,
    staleTime: 0,
  });
}
