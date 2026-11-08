import { Settings2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/features/github/queries";
import { useSettingsStore } from "@/features/settings/store";
import { Avatar } from "@/shared/ui/avatar";
import { Menu } from "@/shared/ui/menu";
import type { MenuItem } from "@/shared/ui/menu";
import { chooseProfile } from "../actions";
import { useProfileDialogStore } from "../dialog-store";
import type { Profile } from "../profile-model";

export function profileMenuLabel(profile: Profile): string {
  return profile.org ? `${profile.label} · ${profile.org}` : profile.label;
}

export function ProfileSwitcher({ repoPath }: { repoPath: string | null }) {
  const { t } = useTranslation();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeId = useSettingsStore((state) => state.activeProfileId);
  const boundId = useSettingsStore((state) => (repoPath ? state.repoProfiles[repoPath] : undefined));
  const showManage = useProfileDialogStore((state) => state.showManage);
  const accounts = useAccounts();

  const currentId = boundId ?? activeId;
  const current = profiles.find((profile) => profile.id === currentId) ?? null;
  const account = accounts.data?.find((candidate) => candidate.id === current?.accountId) ?? null;

  const items: MenuItem[] = profiles.map((profile) => ({
    label: profileMenuLabel(profile),
    checked: profile.id === currentId,
    onSelect: () => chooseProfile(repoPath, profile),
  }));
  items.push({
    label: profiles.length > 0 ? t("profiles.manage") : t("profiles.create"),
    icon: <Settings2 className="size-4" />,
    onSelect: showManage,
  });

  return (
    <Menu
      label={t("profiles.switcher", { name: current ? current.label : t("profiles.none") })}
      trigger={
        account ? <Avatar url={account.avatarUrl} name={account.login} size={20} /> : <UserRound className="size-4" />
      }
      items={items}
    />
  );
}
