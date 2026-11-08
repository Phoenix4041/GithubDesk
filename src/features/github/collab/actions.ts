import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { targetScope } from "../target";
import type { GithubTarget } from "../target";
import { diffSets, splitReviewerKeys } from "./collab-model";
import { editIssue, removeReviewers, requestReviewers, setPullDraft, updatePullBranch } from "./api";
import type { IssueEdit } from "./api";

async function run(target: GithubTarget, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return true;
  } catch (error) {
    reportError(error);
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return false;
  }
}

export async function saveEdit(target: GithubTarget, number: number, edit: IssueEdit): Promise<boolean> {
  const saved = await run(target, () => editIssue(target, number, edit));
  if (saved) {
    showToast({ kind: "success", title: i18next.t("github.collab.saved", { number }) });
  }
  return saved;
}

export async function saveReviewers(
  target: GithubTarget,
  number: number,
  current: readonly string[],
  next: readonly string[],
): Promise<boolean> {
  const { added, removed } = diffSets(current, next);
  const toAdd = splitReviewerKeys(added);
  const toRemove = splitReviewerKeys(removed);
  const saved = await run(target, async () => {
    if (toAdd.users.length + toAdd.teams.length > 0) {
      await requestReviewers(target, number, toAdd.users, toAdd.teams);
    }
    if (toRemove.users.length + toRemove.teams.length > 0) {
      await removeReviewers(target, number, toRemove.users, toRemove.teams);
    }
  });
  if (saved) {
    showToast({ kind: "success", title: i18next.t("github.collab.reviewersSaved") });
  }
  return saved;
}

export async function changeDraft(target: GithubTarget, number: number, draft: boolean): Promise<boolean> {
  const changed = await run(target, () => setPullDraft(target, number, draft));
  if (changed) {
    showToast({ kind: "success", title: i18next.t(draft ? "github.collab.nowDraft" : "github.collab.nowReady", { number }) });
  }
  return changed;
}

export async function refreshPullBranch(target: GithubTarget, number: number): Promise<boolean> {
  const updated = await run(target, () => updatePullBranch(target, number));
  if (updated) {
    showToast({ kind: "info", title: i18next.t("github.collab.branchUpdating") });
  }
  return updated;
}
