import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { branchFromRescue, deleteRescue, restoreRescue } from "./api";

export async function applyRescue(repoPath: string, id: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => restoreRescue(repoPath, id));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("rescue.applied") });
  }
  return succeeded;
}

export async function createBranchFromRescue(repoPath: string, id: string, name: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => branchFromRescue(repoPath, id, name));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("rescue.branchCreated", { name }) });
  }
  return succeeded;
}

export function removeRescue(repoPath: string, id: string): Promise<boolean> {
  return performRepoAction(repoPath, () => deleteRescue(repoPath, id));
}
