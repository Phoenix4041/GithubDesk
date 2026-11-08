import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getCleanupPreview, getStaleRemoteBranches } from "./api";

export function useCleanupPreview(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.cleanup(repoPath),
    queryFn: () => getCleanupPreview(repoPath),
    staleTime: 0,
  });
}

export function useStaleRemoteBranches(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.staleRemote(repoPath),
    queryFn: () => getStaleRemoteBranches(repoPath),
    enabled,
    staleTime: 0,
    retry: false,
  });
}
