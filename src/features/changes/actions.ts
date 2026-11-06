import { i18next } from "@/i18n";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import type { FileDiff, HeadCommit, LineSelection, StatusEntry } from "@/shared/types/git";
import {
  abortMerge,
  createCommit,
  discardChanges,
  stagePaths,
  stageSelection,
  undoLastCommit,
  unstagePaths,
  unstageSelection,
} from "./api";

async function perform(repoPath: string, operation: () => Promise<unknown>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    reportError(error);
    return false;
  } finally {
    await refreshRepository(repoPath);
  }
}

export function stageFiles(repoPath: string, paths: string[]): Promise<boolean> {
  return perform(repoPath, () => stagePaths(repoPath, paths));
}

export function unstageFiles(repoPath: string, paths: string[]): Promise<boolean> {
  return perform(repoPath, () => unstagePaths(repoPath, paths));
}

export function discardFiles(repoPath: string, entries: readonly StatusEntry[]): Promise<boolean> {
  const tracked = entries.filter((entry) => !entry.untracked).map((entry) => entry.path);
  const untracked = entries.filter((entry) => entry.untracked).map((entry) => entry.path);
  return perform(repoPath, () => discardChanges(repoPath, tracked, untracked));
}

export function stageLines(repoPath: string, diff: FileDiff, selections: LineSelection[]): Promise<boolean> {
  return perform(repoPath, () => stageSelection(repoPath, diff, selections));
}

export function unstageLines(repoPath: string, diff: FileDiff, selections: LineSelection[]): Promise<boolean> {
  return perform(repoPath, () => unstageSelection(repoPath, diff, selections));
}

export async function commitStagedChanges(
  repoPath: string,
  title: string,
  description: string,
  amend: boolean,
): Promise<boolean> {
  const succeeded = await perform(repoPath, async () => {
    await createCommit(repoPath, title, description, amend);
  });
  if (succeeded) {
    showToast({
      kind: "success",
      title: i18next.t(amend ? "commit.amended" : "commit.created"),
      message: title,
    });
  }
  return succeeded;
}

export async function undoHeadCommit(repoPath: string): Promise<HeadCommit | null> {
  try {
    const undone = await undoLastCommit(repoPath);
    showToast({ kind: "info", title: i18next.t("commit.undone"), message: undone.title });
    return undone;
  } catch (error) {
    reportError(error);
    return null;
  } finally {
    await refreshRepository(repoPath);
  }
}

export async function abortCurrentMerge(repoPath: string): Promise<boolean> {
  const succeeded = await perform(repoPath, () => abortMerge(repoPath));
  if (succeeded) {
    showToast({ kind: "info", title: i18next.t("changes.mergeAborted") });
  }
  return succeeded;
}
