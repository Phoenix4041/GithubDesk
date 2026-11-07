import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { installLfs, trackLfsPattern, untrackLfsPattern } from "./api";

export async function enableLfs(repoPath: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => installLfs(repoPath));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("lfs.enabled") });
  }
  return succeeded;
}

export async function trackPattern(repoPath: string, pattern: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => trackLfsPattern(repoPath, pattern));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("lfs.tracked", { pattern }), message: i18next.t("lfs.commitReminder") });
  }
  return succeeded;
}

export async function untrackPattern(repoPath: string, pattern: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => untrackLfsPattern(repoPath, pattern));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("lfs.untracked", { pattern }), message: i18next.t("lfs.commitReminder") });
  }
  return succeeded;
}

export function runRepoWork(repoPath: string, work: () => Promise<void>): Promise<boolean> {
  return performRepoAction(repoPath, work);
}
