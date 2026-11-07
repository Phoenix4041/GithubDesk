import { i18next } from "@/i18n";
import { queryClient, refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { useUiStore } from "@/shared/lib/ui-store";
import type { Progress } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { targetScope } from "../target";
import type { GithubTarget } from "../target";
import type { MergeMethod, NewPull, NewReviewComment, PullRequest } from "../types";
import {
  checkoutPull,
  commentOnPull,
  createPull,
  createReviewComment,
  mergePull,
  replyToReviewComment,
  reviewPull,
  setPullState,
} from "./api";
import { reviewCommentsKey } from "./queries";
import { usePullStore } from "./store";

async function run<T>(target: GithubTarget, work: () => Promise<T>): Promise<T | null> {
  try {
    const result = await work();
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return result;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export async function openNewPull(target: GithubTarget, request: NewPull): Promise<PullRequest | null> {
  const created = await run(target, () => createPull(target, request));
  if (created) {
    showToast({ kind: "success", title: i18next.t("github.pulls.created", { number: created.number }) });
    useUiStore.getState().setTab("pulls");
    usePullStore.getState().select(created.number);
  }
  return created;
}

export async function addPullComment(target: GithubTarget, number: number, body: string): Promise<boolean> {
  const comment = await run(target, () => commentOnPull(target, number, body));
  return comment !== null;
}

async function refreshReviewComments<T>(target: GithubTarget, number: number, work: () => Promise<T>): Promise<T | null> {
  try {
    const result = await work();
    await queryClient.invalidateQueries({ queryKey: reviewCommentsKey(target, number) });
    return result;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export async function addInlineComment(target: GithubTarget, number: number, request: NewReviewComment): Promise<boolean> {
  const created = await refreshReviewComments(target, number, () => createReviewComment(target, number, request));
  if (created) {
    showToast({ kind: "success", title: i18next.t("github.pulls.inline.sent") });
  }
  return created !== null;
}

export async function replyInThread(target: GithubTarget, number: number, threadId: number, body: string): Promise<boolean> {
  const reply = await refreshReviewComments(target, number, () => replyToReviewComment(target, number, threadId, body));
  if (reply) {
    showToast({ kind: "success", title: i18next.t("github.pulls.inline.replied") });
  }
  return reply !== null;
}

export async function mergeExistingPull(
  target: GithubTarget,
  number: number,
  method: MergeMethod,
  title: string | null,
  message: string | null,
): Promise<boolean> {
  const result = await run(target, () => mergePull(target, number, method, title, message));
  if (result?.merged) {
    showToast({ kind: "success", title: i18next.t("github.pulls.merged", { number }) });
    return true;
  }
  return false;
}

export async function changePullState(target: GithubTarget, number: number, state: "open" | "closed"): Promise<boolean> {
  const updated = await run(target, () => setPullState(target, number, state));
  if (updated) {
    showToast({
      kind: "info",
      title: i18next.t(state === "closed" ? "github.pulls.closedToast" : "github.pulls.reopenedToast", { number }),
    });
  }
  return updated !== null;
}

export async function sendReview(target: GithubTarget, number: number, event: string, body: string): Promise<boolean> {
  const review = await run(target, () => reviewPull(target, number, event, body));
  if (review) {
    showToast({ kind: "success", title: i18next.t("github.pulls.reviewSent") });
  }
  return review !== null;
}

export async function bringPullToThisComputer(
  repoPath: string,
  target: GithubTarget,
  number: number,
  onProgress: (progress: Progress) => void,
): Promise<boolean> {
  try {
    const branch = await checkoutPull(repoPath, target.remoteName, number, crypto.randomUUID(), onProgress);
    showToast({ kind: "success", title: i18next.t("github.pulls.checkedOut", { branch }) });
    await refreshRepository(repoPath);
    return true;
  } catch (error) {
    reportError(error);
    await refreshRepository(repoPath);
    return false;
  }
}
