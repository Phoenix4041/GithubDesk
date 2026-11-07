import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getRebaseOntoPreview, getRebasePlan } from "./api";

export function useRebasePlan(repoPath: string, base: string) {
  return useQuery({
    queryKey: repoKeys.rebasePlan(repoPath, base),
    queryFn: () => getRebasePlan(repoPath, base),
    enabled: base !== "",
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useRebaseOntoPreview(repoPath: string, target: string) {
  return useQuery({
    queryKey: repoKeys.rebaseOntoPreview(repoPath, target),
    queryFn: () => getRebaseOntoPreview(repoPath, target),
    staleTime: 0,
    gcTime: 0,
  });
}
