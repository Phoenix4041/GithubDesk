import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { reportError } from "@/shared/lib/report-error";
import type { BisectVerdict } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { finishBisect, getBisectState, markBisect, startBisect } from "./api";
import { useBisectDialogStore } from "./store";

export async function startBisectSession(repoPath: string, bad: string, good: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => startBisect(repoPath, bad.trim(), good.trim()));
  if (succeeded) {
    showToast({ kind: "info", title: i18next.t("bisect.started") });
  }
  return succeeded;
}

export function markBisectCommit(repoPath: string, verdict: BisectVerdict, revision: string | null): Promise<boolean> {
  return performRepoAction(repoPath, () => markBisect(repoPath, verdict, revision));
}

export async function finishBisectSession(repoPath: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => finishBisect(repoPath));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("bisect.finished") });
  }
  return succeeded;
}

export async function markFromHistory(repoPath: string, verdict: "good" | "bad", hash: string): Promise<void> {
  try {
    const state = await getBisectState(repoPath);
    if (state.active) {
      await markBisectCommit(repoPath, verdict, hash);
      return;
    }
    useBisectDialogStore.getState().show(verdict === "bad" ? { bad: hash } : { good: hash });
  } catch (error) {
    reportError(error);
  }
}
