import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listRescue, previewRescue } from "./api";

export function useRescueList(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.rescue(repoPath),
    queryFn: () => listRescue(repoPath),
    staleTime: 0,
  });
}

export function useRescueDetail(repoPath: string, id: string | null) {
  return useQuery({
    queryKey: repoKeys.rescueDetail(repoPath, id ?? ""),
    queryFn: () => previewRescue(repoPath, id ?? ""),
    enabled: id !== null,
    staleTime: 60_000,
  });
}
