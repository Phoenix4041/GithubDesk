import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getIdentity, listKeysOutsideRepository } from "./api";

export function useIdentity(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.identity(repoPath),
    queryFn: () => getIdentity(repoPath),
    staleTime: 10_000,
  });
}

export function useAvailableKeys() {
  return useQuery({
    queryKey: ["profiles", "keys"] as const,
    queryFn: listKeysOutsideRepository,
    staleTime: 60_000,
    retry: false,
  });
}
