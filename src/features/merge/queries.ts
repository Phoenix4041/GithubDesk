import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getMergePreview } from "./api";

export function useMergePreview(repoPath: string, source: string) {
  return useQuery({
    queryKey: repoKeys.mergePreview(repoPath, source),
    queryFn: () => getMergePreview(repoPath, source),
    staleTime: 0,
  });
}
