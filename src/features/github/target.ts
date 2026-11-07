import type { QueryKey } from "@tanstack/react-query";

export interface GithubTarget {
  accountId: string;
  host: string;
  owner: string;
  repo: string;
  remoteName: string;
}

export function targetKey(target: GithubTarget, ...parts: Array<string | number | boolean | null>): QueryKey {
  return ["github", target.accountId, target.owner, target.repo, ...parts];
}

export function targetScope(target: GithubTarget): QueryKey {
  return ["github", target.accountId, target.owner, target.repo];
}
