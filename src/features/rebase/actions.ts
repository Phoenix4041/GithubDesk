import { i18next } from "@/i18n";
import { refreshRepository } from "@/shared/lib/query-client";
import { performRepoAction } from "@/shared/lib/repo-action";
import { reportError } from "@/shared/lib/report-error";
import { CommandError } from "@/shared/lib/tauri-client";
import type { RebaseStepPayload } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { runRebaseOnto, startRebase } from "./api";

export async function runInteractiveRebase(
  repoPath: string,
  base: string,
  steps: RebaseStepPayload[],
): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => startRebase(repoPath, base, steps));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("rebase.done") });
  }
  return succeeded;
}

export type RebaseOntoResult = "done" | "conflict" | "failed";

export async function rebaseOntoBranch(repoPath: string, target: string, keepMerges: boolean): Promise<RebaseOntoResult> {
  try {
    await runRebaseOnto(repoPath, target, keepMerges);
    showToast({ kind: "success", title: i18next.t("rebaseOnto.done") });
    return "done";
  } catch (error) {
    if (error instanceof CommandError && error.appError.kind === "mergeConflict") {
      showToast({ kind: "info", title: i18next.t("rebaseOnto.conflictTitle"), message: i18next.t("rebaseOnto.conflictMessage") });
      return "conflict";
    }
    reportError(error);
    return "failed";
  } finally {
    await refreshRepository(repoPath);
  }
}
