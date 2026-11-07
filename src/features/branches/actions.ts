import { i18next } from "@/i18n";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import type { Branch } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { createBranch, deleteBranch, renameBranch, switchBranch } from "./api";
import { useBranchDialogStore } from "./dialog-store";

async function perform(repoPath: string, operation: () => Promise<void>, onError?: (error: unknown) => void): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    if (onError) {
      onError(error);
    } else {
      reportError(error);
    }
    return false;
  } finally {
    await refreshRepository(repoPath);
  }
}

function localNameFor(branch: Branch): string {
  const prefix = branch.remote ? `${branch.remote}/` : "";
  return prefix && branch.name.startsWith(prefix) ? branch.name.slice(prefix.length) : branch.name;
}

export function switchToBranch(repoPath: string, branch: Branch, allBranches: readonly Branch[]): Promise<boolean> {
  if (branch.isCurrent) {
    return Promise.resolve(true);
  }
  if (!branch.isRemote) {
    return perform(repoPath, () => switchBranch(repoPath, branch.name, false));
  }
  const localName = localNameFor(branch);
  const existingLocal = allBranches.find((candidate) => !candidate.isRemote && candidate.name === localName);
  if (existingLocal) {
    return perform(repoPath, () => switchBranch(repoPath, existingLocal.name, false));
  }
  return perform(repoPath, () => switchBranch(repoPath, branch.name, true));
}

export async function createAndSwitchBranch(
  repoPath: string,
  name: string,
  checkout: boolean,
  startPoint: string | null,
): Promise<boolean> {
  const succeeded = await perform(repoPath, () => createBranch(repoPath, name, startPoint, checkout));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("branches.created", { name }) });
  }
  return succeeded;
}

export async function renameExistingBranch(repoPath: string, oldName: string, newName: string): Promise<boolean> {
  const succeeded = await perform(repoPath, () => renameBranch(repoPath, oldName, newName));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("branches.renamed", { oldName, newName }) });
  }
  return succeeded;
}

export async function deleteExistingBranch(repoPath: string, name: string, force: boolean): Promise<boolean> {
  const succeeded = await perform(
    repoPath,
    () => deleteBranch(repoPath, name, force),
    (error) =>
      reportError(error, {
        forceDelete: () => useBranchDialogStore.getState().show({ kind: "delete", name, force: true }),
      }),
  );
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("branches.deleted", { name }) });
  }
  return succeeded;
}
