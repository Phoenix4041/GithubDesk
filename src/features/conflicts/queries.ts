import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getConflict } from "./api";

export function useConflictFile(repoPath: string, filePath: string) {
  return useQuery({
    queryKey: repoKeys.conflict(repoPath, filePath),
    queryFn: () => getConflict(repoPath, filePath),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
