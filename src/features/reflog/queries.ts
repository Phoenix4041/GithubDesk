import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getUndoPlan, getUndoPreview, listReflogRef, listReflogRefs, REFLOG_LIMIT } from "./api";

export function useReflog(repoPath: string, reference: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.reflogRef(repoPath, reference),
    queryFn: () => listReflogRef(repoPath, reference, REFLOG_LIMIT),
    enabled,
  });
}

export function useReflogRefs(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.reflogRefs(repoPath),
    queryFn: () => listReflogRefs(repoPath),
    enabled,
  });
}

export function useUndoPlan(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.undoPlan(repoPath),
    queryFn: () => getUndoPlan(repoPath),
  });
}

export function useUndoPreview(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.undoPreview(repoPath),
    queryFn: () => getUndoPreview(repoPath),
    enabled,
    gcTime: 0,
  });
}
