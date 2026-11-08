import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";

export interface ForkParent {
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
}

export interface ForkInfo {
  isFork: boolean;
  defaultBranch: string;
  parent: ForkParent | null;
}

export type ForkSyncStatus = "fastForward" | "merged" | "upToDate" | "conflict";

export interface ForkSyncResult {
  status: ForkSyncStatus;
  branch: string;
  baseBranch: string;
  message: string;
}

export function getForkInfo(target: GithubTarget): Promise<ForkInfo> {
  return call<ForkInfo>("github_fork_info", { accountId: target.accountId, owner: target.owner, repo: target.repo });
}

export function syncFork(target: GithubTarget, branch: string): Promise<ForkSyncResult> {
  return call<ForkSyncResult>("github_fork_sync", {
    accountId: target.accountId,
    owner: target.owner,
    repo: target.repo,
    branch,
  });
}

export function addUpstreamRemote(path: string, url: string): Promise<void> {
  return call<void>("github_fork_add_upstream", { path, url });
}
