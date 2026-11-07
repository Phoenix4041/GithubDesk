import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import type { ResetMode } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { cherryPickCommits, checkoutCommit, resetToCommit, revertCommit } from "./api";

export async function cherryPickIntoCurrentBranch(repoPath: string, hashesOldestFirst: string[]): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => cherryPickCommits(repoPath, hashesOldestFirst));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("commitActions.cherryPicked", { count: hashesOldestFirst.length }) });
  }
  return succeeded;
}

export async function revertSingleCommit(repoPath: string, hash: string, mainline: number | null): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => revertCommit(repoPath, hash, mainline));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("commitActions.reverted") });
  }
  return succeeded;
}

export async function resetCurrentBranchTo(repoPath: string, hash: string, mode: ResetMode): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => resetToCommit(repoPath, hash, mode));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t(`commitActions.reset.${mode}.done`) });
  }
  return succeeded;
}

export async function checkoutCommitDetached(repoPath: string, hash: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => checkoutCommit(repoPath, hash));
  if (succeeded) {
    showToast({ kind: "info", title: i18next.t("commitActions.checkedOut", { hash: hash.slice(0, 7) }) });
  }
  return succeeded;
}
