import { i18next } from "@/i18n";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import type { CleanupReport, CleanupRequest } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { runCleanup } from "./api";

export async function cleanRepository(repoPath: string, request: CleanupRequest): Promise<CleanupReport | null> {
  try {
    const report = await runCleanup(repoPath, request);
    showToast({
      kind: "success",
      title: i18next.t("cleanup.done", {
        files: report.removedFiles,
        branches: report.deletedBranches.length,
        pruned: report.prunedBranches,
      }),
    });
    if (report.failures.length > 0) {
      showToast({
        kind: "error",
        title: i18next.t("cleanup.partial"),
        message: report.failures.map((failure) => `${failure.item}: ${failure.detail}`).join("\n"),
      });
    }
    return report;
  } catch (error) {
    reportError(error);
    return null;
  } finally {
    await refreshRepository(repoPath);
  }
}
