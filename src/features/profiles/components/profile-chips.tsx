import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/features/github/queries";
import { useSettingsStore } from "@/features/settings/store";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { useProfileDialogStore } from "../dialog-store";
import { profileMenuLabel } from "./profile-switcher";

export function ProfileChips() {
  const { t } = useTranslation();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeId = useSettingsStore((state) => state.activeProfileId);
  const setActive = useSettingsStore((state) => state.setActiveProfile);
  const showManage = useProfileDialogStore((state) => state.showManage);
  const accounts = useAccounts();

  return (
    <section className="flex flex-wrap items-center gap-2" aria-label={t("profiles.chipsLabel")}>
      {profiles.length > 0 ? (
        <div role="radiogroup" aria-label={t("profiles.chipsLabel")} className="flex flex-wrap gap-1.5">
          {profiles.map((profile) => {
            const account = accounts.data?.find((candidate) => candidate.id === profile.accountId);
            return (
              <button
                key={profile.id}
                type="button"
                role="radio"
                aria-checked={profile.id === activeId}
                onClick={() => setActive(profile.id === activeId ? null : profile.id)}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-subtle aria-checked:border-accent aria-checked:bg-accent-soft"
              >
                <Avatar url={account?.avatarUrl} name={account?.login ?? profile.label} size={16} />
                {profileMenuLabel(profile)}
              </button>
            );
          })}
        </div>
      ) : null}
      <Button size="sm" variant="ghost" icon={<Settings2 className="size-3.5" />} onClick={showManage}>
        {profiles.length > 0 ? t("profiles.manage") : t("profiles.create")}
      </Button>
    </section>
  );
}
