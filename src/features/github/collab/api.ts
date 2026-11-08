import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";
import type { Issue, Milestone, TeamRef } from "../types";

export interface IssueEdit {
  title?: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
  clearMilestone?: boolean;
}

function base(target: GithubTarget) {
  return { accountId: target.accountId, owner: target.owner, repo: target.repo };
}

export function editIssue(target: GithubTarget, number: number, edit: IssueEdit): Promise<Issue> {
  return call<Issue>("github_issue_edit", { ...base(target), number, edit });
}

export function requestReviewers(target: GithubTarget, number: number, reviewers: string[], teams: string[]): Promise<void> {
  return call<void>("github_pull_request_reviewers", { ...base(target), number, reviewers, teams });
}

export function removeReviewers(target: GithubTarget, number: number, reviewers: string[], teams: string[]): Promise<void> {
  return call<void>("github_pull_remove_reviewers", { ...base(target), number, reviewers, teams });
}

export function listRepoTeams(target: GithubTarget): Promise<TeamRef[]> {
  return call<TeamRef[]>("github_repo_teams", base(target));
}

export function listMilestones(target: GithubTarget, milestoneState: "open" | "closed" | "all"): Promise<Milestone[]> {
  return call<Milestone[]>("github_milestones_list", { ...base(target), milestoneState });
}

export function updatePullBranch(target: GithubTarget, number: number): Promise<void> {
  return call<void>("github_pull_update_branch", { ...base(target), number });
}

export function setPullDraft(target: GithubTarget, number: number, draft: boolean): Promise<void> {
  return call<void>("github_pull_set_draft", { ...base(target), number, draft });
}
