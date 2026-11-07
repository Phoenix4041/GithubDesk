import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import type { ConflictSide, LineEnding } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { chooseConflictSide, resolveConflict } from "./api";

export async function resolveConflictWithContent(
  repoPath: string,
  filePath: string,
  content: string,
  lineEnding: LineEnding,
): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => resolveConflict(repoPath, filePath, content, lineEnding));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("conflicts.resolvedToast", { path: filePath }) });
  }
  return succeeded;
}

export async function resolveConflictWithSide(repoPath: string, filePath: string, side: ConflictSide): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => chooseConflictSide(repoPath, filePath, side));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("conflicts.resolvedToast", { path: filePath }) });
  }
  return succeeded;
}
