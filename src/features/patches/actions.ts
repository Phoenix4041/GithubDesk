import { i18next } from "@/i18n";
import { pickDirectory, pickFiles } from "@/shared/lib/dialogs";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { CommandError } from "@/shared/lib/tauri-client";
import type { PatchApplyMode } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { applyPatches, exportPatches } from "./api";
import { usePatchDialogStore } from "./store";

export type PatchResult = "done" | "conflict" | "failed";

export async function exportCommitsAsPatches(repoPath: string, hashesOldestFirst: string[]): Promise<boolean> {
  const directory = await pickDirectory(i18next.t("patches.chooseFolder"));
  if (!directory) {
    return false;
  }
  try {
    const files = await exportPatches(repoPath, hashesOldestFirst, directory);
    showToast({ kind: "success", title: i18next.t("patches.exported", { count: files.length }) });
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export async function choosePatchesToApply(): Promise<void> {
  const files = await pickFiles(i18next.t("patches.chooseFiles"), [
    { name: i18next.t("patches.fileFilter"), extensions: ["patch", "diff", "mbox", "eml"] },
  ]);
  if (files.length > 0) {
    usePatchDialogStore.getState().show(files);
  }
}

export async function applyPatchFiles(
  repoPath: string,
  files: string[],
  mode: PatchApplyMode,
): Promise<PatchResult> {
  try {
    await applyPatches(repoPath, files, mode);
    showToast({ kind: "success", title: i18next.t(`patches.done.${mode}`, { count: files.length }) });
    return "done";
  } catch (error) {
    if (error instanceof CommandError && error.appError.kind === "mergeConflict") {
      showToast({ kind: "info", title: i18next.t("patches.conflictTitle"), message: i18next.t("patches.conflictMessage") });
      return "conflict";
    }
    reportError(error);
    return "failed";
  } finally {
    await refreshRepository(repoPath);
  }
}
