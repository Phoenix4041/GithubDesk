import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";
import type { CheckRun } from "../types";

export function getCommitChecks(target: GithubTarget, sha: string): Promise<CheckRun[]> {
  return call<CheckRun[]>("github_commit_checks", {
    accountId: target.accountId,
    owner: target.owner,
    repo: target.repo,
    sha,
  });
}
