import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getCommitSignature, getSigningConfig, listSigningKeys } from "./api";

export function useSigningConfig(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.signingConfig(repoPath),
    queryFn: () => getSigningConfig(repoPath),
    staleTime: 30_000,
  });
}

export function useSigningKeys(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.signingKeys(repoPath),
    queryFn: () => listSigningKeys(repoPath),
    enabled,
    staleTime: 0,
  });
}

export function useCommitSignature(repoPath: string, hash: string | null) {
  return useQuery({
    queryKey: repoKeys.signature(repoPath, hash ?? ""),
    queryFn: () => getCommitSignature(repoPath, hash ?? ""),
    enabled: hash !== null,
    staleTime: Infinity,
    retry: false,
  });
}
