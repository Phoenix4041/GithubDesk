import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import type { SigningUpdate } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { setSigningConfig, testSigning } from "./api";

export async function saveSigningConfig(repoPath: string, update: SigningUpdate): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => setSigningConfig(repoPath, update));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("signing.saved") });
  }
  return succeeded;
}

export async function runSigningTest(repoPath: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => testSigning(repoPath));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("signing.testPassed") });
  }
  return succeeded;
}
