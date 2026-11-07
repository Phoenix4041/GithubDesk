import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getLfsStatus } from "./api";

export function useLfsStatus(repoPath: string, enabled = true) {
  return useQuery({
    queryKey: repoKeys.lfs(repoPath),
    queryFn: () => getLfsStatus(repoPath),
    enabled,
  });
}
