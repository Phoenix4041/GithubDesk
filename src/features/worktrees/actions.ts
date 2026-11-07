import { i18next } from "@/i18n";
import { openRepositoryFromPath } from "@/features/repositories/actions";
import { useRepositoriesStore } from "@/features/repositories/store";
import { performRepoAction } from "@/shared/lib/repo-action";
import type { NewWorktree } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { addWorktree, lockWorktree, pruneWorktrees, removeWorktree, unlockWorktree } from "./api";

export async function createWorktree(repoPath: string, request: NewWorktree): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => addWorktree(repoPath, request));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("worktrees.created") });
  }
  return succeeded;
}

function sameFolder(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function forgetRecent(path: string): void {
  const { recents, forget } = useRepositoriesStore.getState();
  for (const recent of recents) {
    if (sameFolder(recent.path, path)) {
      forget(recent.path);
    }
  }
}

export async function removeExistingWorktree(repoPath: string, worktree: string, force: boolean): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => removeWorktree(repoPath, worktree, force));
  if (succeeded) {
    forgetRecent(worktree);
    showToast({ kind: "success", title: i18next.t("worktrees.removed") });
  }
  return succeeded;
}

export async function lockExistingWorktree(repoPath: string, worktree: string, reason: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => lockWorktree(repoPath, worktree, reason.trim() || null));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("worktrees.locked") });
  }
  return succeeded;
}

export async function unlockExistingWorktree(repoPath: string, worktree: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => unlockWorktree(repoPath, worktree));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("worktrees.unlocked") });
  }
  return succeeded;
}

export async function pruneStaleWorktrees(repoPath: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => pruneWorktrees(repoPath));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("worktrees.pruned") });
  }
  return succeeded;
}

export function openWorktree(path: string): Promise<boolean> {
  return openRepositoryFromPath(path);
}
