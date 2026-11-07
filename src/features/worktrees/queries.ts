import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listWorktrees } from "./api";

export function useWorktrees(repoPath: string, enabled = true) {
  return useQuery({
    queryKey: repoKeys.worktrees(repoPath),
    queryFn: () => listWorktrees(repoPath),
    enabled,
  });
}
