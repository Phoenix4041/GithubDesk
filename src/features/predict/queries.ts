import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { predictBranches } from "./api";
import type { Prediction } from "./api";

export const MAX_PREDICTED_BRANCHES = 50;

export function usePredictions(repoPath: string, sources: readonly string[], enabled: boolean): ReadonlyMap<string, Prediction> {
  const limited = sources.slice(0, MAX_PREDICTED_BRANCHES);
  const query = useQuery({
    queryKey: repoKeys.predictions(repoPath, limited),
    queryFn: () => predictBranches(repoPath, limited),
    enabled: enabled && limited.length > 0,
    staleTime: 30_000,
    retry: false,
  });
  const map = new Map<string, Prediction>();
  if (Array.isArray(query.data)) {
    for (const prediction of query.data) {
      map.set(prediction.source, prediction);
    }
  }
  return map;
}
