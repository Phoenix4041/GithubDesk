import { i18next } from "@/i18n";
import { useSettingsStore } from "@/features/settings/store";
import { queryClient, repoKeys } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { applyIdentity } from "./api";
import { useProfileDialogStore } from "./dialog-store";
import type { Profile } from "./profile-model";

export async function applyProfileToRepo(repoPath: string, profile: Profile): Promise<boolean> {
  try {
    await applyIdentity(repoPath, {
      name: profile.name,
      email: profile.email,
      signing: profile.signingKey ? { key: profile.signingKey, format: profile.signingFormat } : null,
    });
  } catch (error) {
    reportError(error);
    return false;
  }
  const settings = useSettingsStore.getState();
  settings.setRepoAccount(repoPath, { accountId: profile.accountId, useForGit: true });
  settings.setRepoProfile(repoPath, profile.id);
  settings.setActiveProfile(profile.id);
  await queryClient.invalidateQueries({ queryKey: repoKeys.identity(repoPath) });
  showToast({ kind: "success", title: i18next.t("profiles.apply.done", { label: profile.label }) });
  return true;
}

export function chooseProfile(repoPath: string | null, profile: Profile): void {
  if (repoPath === null) {
    useSettingsStore.getState().setActiveProfile(profile.id);
    return;
  }
  useProfileDialogStore.getState().showApply({ repoPath, profile });
}
