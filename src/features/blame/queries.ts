import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getBlame } from "./api";
import type { BlameTarget } from "./store";

export function useBlame(repoPath: string, target: BlameTarget | null, ignoreWhitespace: boolean) {
  return useQuery({
    queryKey: repoKeys.blame(repoPath, target?.path ?? "", target?.revision ?? null, ignoreWhitespace),
    queryFn: () => {
      if (!target) {
        throw new Error("No file selected");
      }
      return getBlame(repoPath, target.path, target.revision, ignoreWhitespace);
    },
    enabled: target !== null,
    staleTime: target?.revision ? Infinity : 5_000,
  });
}
