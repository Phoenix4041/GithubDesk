import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getBisectState } from "./api";

export function useBisectState(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.bisect(repoPath),
    queryFn: () => getBisectState(repoPath),
    staleTime: 5_000,
  });
}
