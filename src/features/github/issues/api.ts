import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";
import type { Comment, Issue, Label, Page, UserRef } from "../types";

function base(target: GithubTarget) {
  return { accountId: target.accountId, owner: target.owner, repo: target.repo };
}

export interface IssueBundle {
  issue: Issue;
  comments: Comment[];
}

export interface NewIssue {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
}

export function listIssues(
  target: GithubTarget,
  issueState: string,
  label: string | null,
  search: string | null,
  page: number,
): Promise<Page<Issue>> {
  return call<Page<Issue>>("github_issues_list", { ...base(target), issueState, label, search, page });
}

export function getIssueBundle(target: GithubTarget, number: number): Promise<IssueBundle> {
  return call<IssueBundle>("github_issue_get", { ...base(target), number });
}

export function createIssue(target: GithubTarget, request: NewIssue): Promise<Issue> {
  return call<Issue>("github_issue_create", { ...base(target), request });
}

export function commentOnIssue(target: GithubTarget, number: number, body: string): Promise<Comment> {
  return call<Comment>("github_issue_comment", { ...base(target), number, body });
}

export function setIssueState(
  target: GithubTarget,
  number: number,
  issueState: "open" | "closed",
  reason: string | null,
): Promise<Issue> {
  return call<Issue>("github_issue_set_state", { ...base(target), number, issueState, reason });
}

export function listLabels(target: GithubTarget): Promise<Label[]> {
  return call<Label[]>("github_labels_list", base(target));
}

export function listAssignees(target: GithubTarget): Promise<UserRef[]> {
  return call<UserRef[]>("github_assignees_list", base(target));
}
