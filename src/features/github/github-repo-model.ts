import type { GithubAccount, RemoteRepo } from "@/shared/types/git";

export const DEFAULT_GITHUB_HOST = "github.com";

export interface GithubRepoContext {
  remote: RemoteRepo;
  candidates: GithubAccount[];
  account: GithubAccount | null;
}

export function pickGithubRemote(remotes: readonly RemoteRepo[], accounts: readonly GithubAccount[]): RemoteRepo | null {
  const hosts = new Set<string>([DEFAULT_GITHUB_HOST, ...accounts.map((account) => account.host)]);
  return remotes.find((remote) => hosts.has(remote.host)) ?? null;
}

export function chooseAccount(
  candidates: readonly GithubAccount[],
  preferredId: string | undefined,
): GithubAccount | null {
  return candidates.find((account) => account.id === preferredId) ?? candidates[0] ?? null;
}

export function buildRepoContext(
  remotes: readonly RemoteRepo[],
  accounts: readonly GithubAccount[],
  preferredAccountId: string | undefined,
): GithubRepoContext | null {
  const remote = pickGithubRemote(remotes, accounts);
  if (!remote) {
    return null;
  }
  const candidates = accounts.filter((account) => account.host === remote.host);
  return { remote, candidates, account: chooseAccount(candidates, preferredAccountId) };
}

export function repositoryUrl(remote: RemoteRepo): string {
  const scheme = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(remote.host) ? "http" : "https";
  return `${scheme}://${remote.host}/${remote.owner}/${remote.name}`;
}
