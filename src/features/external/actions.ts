import { i18next } from "@/i18n";
import { useSettingsStore } from "@/features/settings/store";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { listEditors, openInEditor, revealInFileManager } from "./api";
import { editorsQueryKey } from "./queries";

async function chooseEditor(): Promise<{ id: string; custom: string | null } | null> {
  const { externalEditor, externalEditorCommand } = useSettingsStore.getState();
  if (externalEditor === "custom") {
    return { id: "custom", custom: externalEditorCommand.trim() || null };
  }
  const editors = await queryClient.fetchQuery({ queryKey: editorsQueryKey, queryFn: listEditors, staleTime: 60_000 });
  if (externalEditor && editors.some((editor) => editor.id === externalEditor)) {
    return { id: externalEditor, custom: null };
  }
  const first = editors[0];
  return first ? { id: first.id, custom: null } : null;
}

export async function openRepositoryInEditor(repoPath: string, relative: string | null = null, line: number | null = null): Promise<boolean> {
  try {
    const editor = await chooseEditor();
    if (!editor) {
      showToast({ kind: "info", title: i18next.t("external.noEditor"), message: i18next.t("external.noEditorHint") });
      return false;
    }
    await openInEditor(repoPath, relative, editor.id, editor.custom, line);
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export async function revealRepositoryPath(repoPath: string, relative: string | null = null): Promise<boolean> {
  try {
    await revealInFileManager(repoPath, relative);
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}
