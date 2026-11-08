import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { previewPatches } from "./api";

export function usePatchPreview(repoPath: string, files: string[]) {
  return useQuery({
    queryKey: repoKeys.patchPreview(repoPath, files),
    queryFn: () => previewPatches(repoPath, files),
    staleTime: 0,
  });
}
