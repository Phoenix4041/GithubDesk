import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listSubmodules } from "./api";

export function useSubmodules(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.submodules(repoPath),
    queryFn: () => listSubmodules(repoPath),
  });
}
