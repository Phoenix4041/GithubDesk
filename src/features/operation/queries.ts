import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getOperationState } from "./api";

export function useRepoOperation(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.operation(repoPath),
    queryFn: () => getOperationState(repoPath),
  });
}
