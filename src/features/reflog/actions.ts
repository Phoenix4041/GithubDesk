import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { restoreHead, undoLastOperation } from "./api";

export async function restoreToReflogEntry(repoPath: string, hash: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => restoreHead(repoPath, hash));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("reflog.restored", { hash: hash.slice(0, 7) }) });
  }
  return succeeded;
}

export async function undoLatestOperation(repoPath: string, expectedCurrent: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => undoLastOperation(repoPath, expectedCurrent));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("reflog.undone") });
  }
  return succeeded;
}
