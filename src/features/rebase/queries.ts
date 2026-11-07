import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getRebasePlan } from "./api";

export function useRebasePlan(repoPath: string, base: string) {
  return useQuery({
    queryKey: repoKeys.rebasePlan(repoPath, base),
    queryFn: () => getRebasePlan(repoPath, base),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
