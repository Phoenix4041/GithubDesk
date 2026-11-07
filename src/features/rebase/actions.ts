import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import type { RebaseStepPayload } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { startRebase } from "./api";

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
