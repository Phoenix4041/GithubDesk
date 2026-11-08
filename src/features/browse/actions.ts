import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { restoreFileAt } from "./api";

export async function restoreFileToRevision(repoPath: string, revision: string, label: string, filePath: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => restoreFileAt(repoPath, revision, filePath));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("browse.restored", { path: filePath, revision: label }) });
  }
  return succeeded;
}
