import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: false,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

export const repoKeys = {
  all: (path: string) => ["repo", path] as const,
  status: (path: string) => ["repo", path, "status"] as const,
  branches: (path: string) => ["repo", path, "branches"] as const,
  remotes: (path: string) => ["repo", path, "remotes"] as const,
  headCommit: (path: string) => ["repo", path, "head-commit"] as const,
  operation: (path: string) => ["repo", path, "operation"] as const,
  history: (path: string) => ["repo", path, "history"] as const,
  diff: (path: string, source: string, file: string, ignoreWhitespace: boolean) =>
    ["repo", path, "diff", source, file, ignoreWhitespace] as const,
  commitFiles: (path: string, hash: string) => ["repo", path, "commit-files", hash] as const,
  commitDetail: (path: string, hash: string) => ["repo", path, "commit-detail", hash] as const,
  commitDiff: (path: string, hash: string, file: string, ignoreWhitespace: boolean) =>
    ["repo", path, "commit-diff", hash, file, ignoreWhitespace] as const,
};

export function refreshRepository(path: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: repoKeys.all(path) });
}
