import type { InboxItem } from "@/features/github/home/api";
import { call } from "@/shared/lib/tauri-client";
import type { RepoState } from "./home-model";

export function getRepoStates(paths: string[]): Promise<RepoState[]> {
  return call<RepoState[]>("home_repo_states", { paths });
}

export function listRepoFiles(path: string): Promise<string[]> {
  return call<string[]>("home_list_files", { path });
}

export function getMentions(accountId: string, org: string | null): Promise<InboxItem[]> {
  return call<InboxItem[]>("github_home_mentions", { accountId, org });
}

export function getFailingPulls(accountId: string, org: string | null): Promise<InboxItem[]> {
  return call<InboxItem[]>("github_home_failing", { accountId, org });
}
