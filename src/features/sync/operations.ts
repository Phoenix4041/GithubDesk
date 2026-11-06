import { i18next } from "@/i18n";
import { queryClient, refreshRepository, repoKeys } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { cancelJob } from "@/shared/lib/tauri-client";
import { showToast } from "@/shared/ui/toast-store";
import type { Progress, StatusSnapshot } from "@/shared/types/git";
import { fetchRemotes, publishBranch, pullCurrentBranch, pushCurrentBranch } from "./api";
import { useSyncStore } from "./store";
import type { SyncKind } from "./store";

function currentBranchName(repoPath: string): string | null {
  return queryClient.getQueryData<StatusSnapshot>(repoKeys.status(repoPath))?.branch.head ?? null;
}

export async function runSyncOperation(kind: SyncKind, repoPath: string, branchName?: string): Promise<void> {
  if (useSyncStore.getState().operation) {
    return;
  }

  const jobId = crypto.randomUUID();
  useSyncStore.getState().begin({ kind, repoPath, jobId });
  const report = (progress: Progress) => useSyncStore.getState().report(progress);

  try {
    switch (kind) {
      case "fetch":
        await fetchRemotes(repoPath, jobId, report);
        break;
      case "pull":
        await pullCurrentBranch(repoPath, jobId, report);
        break;
      case "push":
        await pushCurrentBranch(repoPath, jobId, report);
        break;
      case "publish": {
        const target = branchName ?? currentBranchName(repoPath);
        if (!target) {
          return;
        }
        await publishBranch(repoPath, target, jobId, report);
        break;
      }
    }
    if (kind !== "fetch") {
      showToast({ kind: "success", title: i18next.t(`sync.done.${kind}`) });
    }
  } catch (error) {
    const branch = branchName ?? currentBranchName(repoPath);
    reportError(error, {
      retry: () => void runSyncOperation(kind, repoPath, branchName),
      pull: () => void runSyncOperation("pull", repoPath),
      publish: branch ? () => void runSyncOperation("publish", repoPath, branch) : undefined,
    });
  } finally {
    useSyncStore.getState().finish();
    await refreshRepository(repoPath);
  }
}

export function cancelSyncOperation(): void {
  const operation = useSyncStore.getState().operation;
  if (operation) {
    void cancelJob(operation.jobId);
  }
}
