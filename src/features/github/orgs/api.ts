import { call } from "@/shared/lib/tauri-client";
import type { NewRepo, OrgSummary, RepoSummary } from "@/shared/types/git";
import type { Page } from "../types";

export function listOrgs(accountId: string): Promise<OrgSummary[]> {
  return call<OrgSummary[]>("github_orgs_list", { accountId });
}

export function listContextRepos(
  accountId: string,
  org: string | null,
  query: string | null,
  page: number,
): Promise<Page<RepoSummary>> {
  return call<Page<RepoSummary>>("github_context_repos", { accountId, org, query, page });
}

export function createRepository(accountId: string, org: string | null, request: NewRepo): Promise<RepoSummary> {
  return call<RepoSummary>("github_repo_create", { accountId, org, request });
}
