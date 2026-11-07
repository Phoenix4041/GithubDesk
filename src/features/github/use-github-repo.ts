import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useSettingsStore } from "@/features/settings/store";
import { repoKeys } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { listGithubRemotes, setGitAccount } from "./api";
import { buildRepoContext } from "./github-repo-model";
import type { GithubRepoContext } from "./github-repo-model";
import { useAccounts } from "./queries";

export interface GithubRepoState {
  context: GithubRepoContext | null;
  useForGit: boolean;
  loading: boolean;
}

export function useGithubRepo(repoPath: string): GithubRepoState {
  const remotes = useQuery({
    queryKey: repoKeys.githubRemotes(repoPath),
    queryFn: () => listGithubRemotes(repoPath),
    staleTime: 60_000,
  });
  const accounts = useAccounts();
  const choice = useSettingsStore((state) => state.repoAccounts[repoPath]);

  const context = useMemo(
    () => (remotes.data && accounts.data ? buildRepoContext(remotes.data, accounts.data, choice?.accountId) : null),
    [remotes.data, accounts.data, choice?.accountId],
  );

  return {
    context,
    useForGit: choice?.useForGit ?? false,
    loading: remotes.isPending || accounts.isPending,
  };
}

export function useGithubGitAuth(repoPath: string): void {
  const { context, useForGit } = useGithubRepo(repoPath);
  const accountId = context?.account?.id ?? null;
  const armed = useForGit ? accountId : null;

  useEffect(() => {
    setGitAccount(repoPath, armed).catch((error: unknown) => reportError(error));
    return () => {
      void setGitAccount(repoPath, null).catch(() => undefined);
    };
  }, [repoPath, armed]);
}
