import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { useUiStore } from "@/shared/lib/ui-store";
import { showToast } from "@/shared/ui/toast-store";
import { applyStash, branchFromStash, dropStash, saveStash } from "./api";
import { useStashStore } from "./store";

function leaveStashView(hash: string): void {
  if (useStashStore.getState().selectedHash === hash) {
    useStashStore.getState().select(null);
    if (useUiStore.getState().tab === "stash") {
      useUiStore.getState().setTab("changes");
    }
  }
}

export async function saveToStash(repoPath: string, message: string, includeUntracked: boolean): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => saveStash(repoPath, message.trim() || null, includeUntracked));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("stash.saved") });
  }
  return succeeded;
}

export async function applyStashEntry(repoPath: string, hash: string, pop: boolean): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => applyStash(repoPath, hash, pop));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t(pop ? "stash.popped" : "stash.applied") });
    if (pop) {
      leaveStashView(hash);
    }
  }
  return succeeded;
}

export async function dropStashEntry(repoPath: string, hash: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => dropStash(repoPath, hash));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("stash.dropped") });
    leaveStashView(hash);
  }
  return succeeded;
}

export async function createBranchFromStash(repoPath: string, hash: string, name: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => branchFromStash(repoPath, hash, name));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("stash.branchCreated", { name }) });
    leaveStashView(hash);
  }
  return succeeded;
}

export function openStash(hash: string): void {
  useStashStore.getState().select(hash);
  useUiStore.getState().setTab("stash");
}
