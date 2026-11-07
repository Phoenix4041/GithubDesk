import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { Progress } from "@/shared/types/git";
import type {
  Comment,
  MergeMethod,
  MergeResult,
  NewPull,
  NewReviewComment,
  Page,
  PullBundle,
  PullFile,
  PullRequest,
  RepoInfo,
  Review,
  ReviewComment,
} from "../types";
import type { GithubTarget } from "../target";

function base(target: GithubTarget) {
  return { accountId: target.accountId, owner: target.owner, repo: target.repo };
}

export function getRepoInfo(target: GithubTarget): Promise<RepoInfo> {
  return call<RepoInfo>("github_repo_info", base(target));
}

export function listPulls(target: GithubTarget, pullState: string, page: number): Promise<Page<PullRequest>> {
  return call<Page<PullRequest>>("github_pulls_list", { ...base(target), pullState, page });
}

export function getPullBundle(target: GithubTarget, number: number): Promise<PullBundle> {
  return call<PullBundle>("github_pull_get", { ...base(target), number });
}

export function listPullFiles(target: GithubTarget, number: number, page: number): Promise<Page<PullFile>> {
  return call<Page<PullFile>>("github_pull_files", { ...base(target), number, page });
}

export function createPull(target: GithubTarget, request: NewPull): Promise<PullRequest> {
  return call<PullRequest>("github_pull_create", { ...base(target), request });
}

export function commentOnPull(target: GithubTarget, number: number, body: string): Promise<Comment> {
  return call<Comment>("github_pull_comment", { ...base(target), number, body });
}

export function listReviewComments(target: GithubTarget, number: number): Promise<ReviewComment[]> {
  return call<ReviewComment[]>("github_pull_review_comments", { ...base(target), number });
}

export function createReviewComment(
  target: GithubTarget,
  number: number,
  request: NewReviewComment,
): Promise<ReviewComment> {
  return call<ReviewComment>("github_pull_review_comment_create", { ...base(target), number, request });
}

export function replyToReviewComment(
  target: GithubTarget,
  number: number,
  commentId: number,
  body: string,
): Promise<ReviewComment> {
  return call<ReviewComment>("github_pull_review_comment_reply", { ...base(target), number, commentId, body });
}

export function mergePull(
  target: GithubTarget,
  number: number,
  method: MergeMethod,
  commitTitle: string | null,
  commitMessage: string | null,
): Promise<MergeResult> {
  return call<MergeResult>("github_pull_merge", { ...base(target), number, method, commitTitle, commitMessage });
}

export function setPullState(target: GithubTarget, number: number, pullState: "open" | "closed"): Promise<PullRequest> {
  return call<PullRequest>("github_pull_set_state", { ...base(target), number, pullState });
}

export function reviewPull(target: GithubTarget, number: number, event: string, body: string): Promise<Review> {
  return call<Review>("github_pull_review", { ...base(target), number, event, body });
}

export function checkoutPull(
  path: string,
  remote: string,
  number: number,
  jobId: string,
  onProgress: (progress: Progress) => void,
): Promise<string> {
  return callWithProgress<string>("github_pull_checkout", { path, remote, number, jobId }, onProgress);
}
