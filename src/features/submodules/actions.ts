import { i18next } from "@/i18n";
import { openRepositoryFromPath } from "@/features/repositories/actions";
import { joinPath } from "@/shared/lib/paths";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { removeSubmodule } from "./api";

export async function removeExistingSubmodule(repoPath: string, submodulePath: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => removeSubmodule(repoPath, submodulePath));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("submodules.removed") });
  }
  return succeeded;
}

export function openSubmodule(repoPath: string, submodulePath: string): Promise<boolean> {
  return openRepositoryFromPath(joinPath(repoPath, submodulePath));
}

export async function runRepoJob(
  repoPath: string,
  work: () => Promise<void>,
  successKey: "submodules.added" | "submodules.updated",
): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, work);
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t(successKey) });
  }
  return succeeded;
}
