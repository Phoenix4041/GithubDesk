import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { createTag, deleteRemoteTag, deleteTag, pushTag } from "./api";

export async function createNewTag(
  repoPath: string,
  name: string,
  target: string | null,
  message: string | null,
): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => createTag(repoPath, name, target, message));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("tags.created", { name }) });
  }
  return succeeded;
}

export async function deleteLocalTag(repoPath: string, name: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => deleteTag(repoPath, name));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("tags.deleted", { name }) });
  }
  return succeeded;
}

export async function pushLocalTag(repoPath: string, name: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => pushTag(repoPath, name, crypto.randomUUID(), () => undefined));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("tags.pushed", { name }) });
  }
  return succeeded;
}

export async function deleteTagOnRemote(repoPath: string, name: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () =>
    deleteRemoteTag(repoPath, name, crypto.randomUUID(), () => undefined),
  );
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("tags.deletedRemote", { name }) });
  }
  return succeeded;
}
