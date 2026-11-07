import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getUndoPlan, listReflog, REFLOG_LIMIT } from "./api";

export function useReflog(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.reflog(repoPath),
    queryFn: () => listReflog(repoPath, REFLOG_LIMIT),
    enabled,
  });
}

export function useUndoPlan(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.undoPlan(repoPath),
    queryFn: () => getUndoPlan(repoPath),
  });
}
