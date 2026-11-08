import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import type { DiffSource } from "@/shared/types/git";
import { getCommitTemplate, getFileDiff, getHeadCommit, getStatus, listCoauthors } from "./api";

export const commitExtrasKeys = {
  coauthors: (path: string) => ["repo", path, "coauthors"] as const,
  template: (path: string) => ["repo", path, "commit-template"] as const,
};

export function useCoauthors(repoPath: string, enabled: boolean) {
  return useQuery({
    queryKey: commitExtrasKeys.coauthors(repoPath),
    queryFn: () => listCoauthors(repoPath),
    enabled,
    staleTime: 60_000,
  });
}

export function useCommitTemplate(repoPath: string) {
  return useQuery({
    queryKey: commitExtrasKeys.template(repoPath),
    queryFn: () => getCommitTemplate(repoPath),
  });
}

export function useStatus(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.status(repoPath),
    queryFn: () => getStatus(repoPath),
  });
}

export function useHeadCommit(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.headCommit(repoPath),
    queryFn: () => getHeadCommit(repoPath),
  });
}

interface FileDiffTarget {
  path: string;
  originalPath: string | null;
  source: DiffSource;
}

export function useFileDiff(repoPath: string, target: FileDiffTarget | null, ignoreWhitespace: boolean) {
  return useQuery({
    queryKey: repoKeys.diff(repoPath, target?.source ?? "none", target?.path ?? "", ignoreWhitespace),
    queryFn: () => {
      if (!target) {
        throw new Error("No file selected");
      }
      return getFileDiff(repoPath, target.path, target.originalPath, target.source, ignoreWhitespace);
    },
    enabled: target !== null,
  });
}
