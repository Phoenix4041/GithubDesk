import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/features/github/queries";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { chooseProfile } from "../actions";
import { useProfileDialogStore } from "../dialog-store";
import { profileMenuLabel } from "./profile-switcher";

function PickerForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeId = useSettingsStore((state) => state.activeProfileId);
  const repoPath = useRepositoriesStore((state) => state.activePath);
  const boundId = useSettingsStore((state) => (repoPath ? state.repoProfiles[repoPath] : undefined));
  const showManage = useProfileDialogStore((state) => state.showManage);
  const accounts = useAccounts();
  const currentId = boundId ?? activeId;

  return (
    <Dialog
      open
      title={t("profiles.picker.title")}
      description={repoPath ? t("profiles.picker.forRepo") : t("profiles.picker.global")}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>{t("common.close")}</Button>
          <Button onClick={showManage}>{t("profiles.manage")}</Button>
        </>
      }
    >
      {profiles.length === 0 ? (
        <p className="text-xs text-muted">{t("profiles.dialog.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("profiles.picker.title")}>
          {profiles.map((profile, index) => {
            const account = accounts.data?.find((candidate) => candidate.id === profile.accountId);
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={profile.id === currentId}
                  data-autofocus={index === 0 ? true : undefined}
                  onClick={() => {
                    onClose();
                    chooseProfile(repoPath, profile);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2 text-left hover:bg-subtle aria-checked:border-accent aria-checked:bg-accent-soft"
                >
                  <Avatar url={account?.avatarUrl} name={account?.login ?? profile.label} size={24} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{profileMenuLabel(profile)}</span>
                    <span className="selectable truncate text-[11px] text-muted">{profile.email}</span>
                  </span>
                  {profile.id === currentId ? <Check className="size-4 text-accent" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

export function ProfilePickerDialog() {
  const open = useProfileDialogStore((state) => state.pickerOpen);
  const hide = useProfileDialogStore((state) => state.hidePicker);
  if (!open) {
    return null;
  }
  return <PickerForm onClose={hide} />;
}
