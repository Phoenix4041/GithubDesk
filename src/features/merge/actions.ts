import { i18next } from "@/i18n";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { CommandError } from "@/shared/lib/tauri-client";
import type { MergeMode } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { mergeIntoCurrent } from "./api";

export type MergeResult = "done" | "conflict" | "failed";

export async function mergeBranch(repoPath: string, source: string, mode: MergeMode, message: string): Promise<MergeResult> {
  try {
    const outcome = await mergeIntoCurrent(repoPath, source, mode, message.trim() || null);
    showToast({ kind: "success", title: i18next.t(`merge.done.${outcome}`, { source }) });
    return "done";
  } catch (error) {
    if (error instanceof CommandError && error.appError.kind === "mergeConflict") {
      showToast({ kind: "info", title: i18next.t("merge.conflictTitle"), message: i18next.t("merge.conflictMessage") });
      return "conflict";
    }
    reportError(error);
    return "failed";
  } finally {
    await refreshRepository(repoPath);
  }
}
