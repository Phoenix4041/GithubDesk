import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { unstagePaths } from "../changes/api";
import { scanStaged } from "./api";
import type { Finding } from "./api";
import { useGuardStore } from "./store";

export async function reviewStagedChanges(repoPath: string): Promise<boolean> {
  let findings: Finding[];
  try {
    findings = await scanStaged(repoPath);
  } catch {
    return true;
  }
  if (!Array.isArray(findings) || findings.length === 0) {
    return true;
  }
  const decision = await useGuardStore.getState().ask(repoPath, findings);
  if (decision.choice === "commit") {
    return true;
  }
  if (decision.choice === "unstage") {
    const paths = Array.from(new Set(decision.findings.map((finding) => finding.path)));
    if (paths.length > 0) {
      const done = await performRepoAction(repoPath, () => unstagePaths(repoPath, paths));
      if (done) {
        showToast({ kind: "info", title: i18next.t("guard.unstaged", { count: paths.length }) });
      }
    }
  }
  return false;
}
