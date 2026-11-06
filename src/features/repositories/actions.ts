import { i18next } from "@/i18n";
import { pickDirectory } from "@/shared/lib/dialogs";
import { reportError } from "@/shared/lib/report-error";
import { openRepository } from "./api";
import { useRepositoriesStore } from "./store";

export async function openRepositoryFromPath(path: string): Promise<boolean> {
  try {
    const info = await openRepository(path);
    useRepositoriesStore.getState().activate(info);
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export async function pickAndOpenRepository(): Promise<void> {
  const selected = await pickDirectory(i18next.t("repositories.openPickerTitle"));
  if (selected) {
    await openRepositoryFromPath(selected);
  }
}
