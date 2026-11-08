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
  tags: (path: string) => ["repo", path, "tags"] as const,
  compare: (path: string) => ["repo", path, "compare"] as const,
  githubRemotes: (path: string) => ["repo", path, "github-remotes"] as const,
  reflog: (path: string) => ["repo", path, "reflog"] as const,
  undoPlan: (path: string) => ["repo", path, "undo-plan"] as const,
  rescue: (path: string) => ["repo", path, "rescue"] as const,
  absorb: (path: string) => ["repo", path, "absorb"] as const,
  stack: (path: string) => ["repo", path, "stack"] as const,
  todos: (path: string) => ["repo", path, "todos"] as const,
  splitFiles: (path: string, hash: string) => ["repo", path, "split-files", hash] as const,
  predictions: (path: string, sources: readonly string[]) => ["repo", path, "predictions", ...sources] as const,
  rescueDetail: (path: string, id: string) => ["repo", path, "rescue-detail", id] as const,
  blame: (path: string, file: string, revision: string | null, ignoreWhitespace: boolean) =>
    ["repo", path, "blame", file, revision, ignoreWhitespace] as const,
  rebaseOntoPreview: (path: string, target: string) => ["repo", path, "rebase-onto-preview", target] as const,
  rebasePlan: (path: string, base: string) => ["repo", path, "rebase-plan", base] as const,
  conflict: (path: string, file: string) => ["repo", path, "conflict", file] as const,
  stashes: (path: string) => ["repo", path, "stashes"] as const,
  mergePreview: (path: string, source: string) => ["repo", path, "merge-preview", source] as const,
  patchPreview: (path: string, files: readonly string[]) => ["repo", path, "patch-preview", ...files] as const,
  bisect: (path: string) => ["repo", path, "bisect"] as const,
  cleanup: (path: string) => ["repo", path, "cleanup"] as const,
  identity: (path: string) => ["repo", path, "identity"] as const,
  staleRemote: (path: string) => ["repo", path, "stale-remote"] as const,
  worktrees: (path: string) => ["repo", path, "worktrees"] as const,
  submodules: (path: string) => ["repo", path, "submodules"] as const,
  ignoreFile: (path: string) => ["repo", path, "ignore-file"] as const,
  ignoredTracked: (path: string) => ["repo", path, "ignored-tracked"] as const,
  lfs: (path: string) => ["repo", path, "lfs"] as const,
  signingConfig: (path: string) => ["repo", path, "signing-config"] as const,
  signingKeys: (path: string) => ["repo", path, "signing-keys"] as const,
  signature: (path: string, hash: string) => ["repo", path, "signature", hash] as const,
  stashFiles: (path: string, hash: string) => ["repo", path, "stash-files", hash] as const,
  stashDiff: (path: string, hash: string, file: string, ignoreWhitespace: boolean) =>
    ["repo", path, "stash-diff", hash, file, ignoreWhitespace] as const,
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
