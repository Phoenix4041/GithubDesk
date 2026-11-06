import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listBranches } from "./api";

export function useBranches(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.branches(repoPath),
    queryFn: () => listBranches(repoPath),
  });
}
