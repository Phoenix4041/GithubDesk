import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listRemotes } from "./api";

export function useRemotes(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.remotes(repoPath),
    queryFn: () => listRemotes(repoPath),
  });
}
