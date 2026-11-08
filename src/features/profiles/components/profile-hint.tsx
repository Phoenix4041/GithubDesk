import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGithubRepo } from "@/features/github/use-github-repo";
import { useAccounts } from "@/features/github/queries";
import { useSettingsStore } from "@/features/settings/store";
import { Button } from "@/shared/ui/button";
import { useProfileDialogStore } from "../dialog-store";
import { suggestProfile } from "../profile-model";

export function ProfileHint({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const { context } = useGithubRepo(repoPath);
  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const bound = useSettingsStore((state) => state.repoProfiles[repoPath]);
  const ignored = useSettingsStore((state) => state.ignoredProfileHints.includes(repoPath));
  const ignoreHint = useSettingsStore((state) => state.ignoreProfileHint);
  const showApply = useProfileDialogStore((state) => state.showApply);

  if (!context || !accounts.data || bound !== undefined || ignored) {
    return null;
  }
  const suggestion = suggestProfile(profiles, accounts.data, context.remote);
  if (!suggestion) {
    return null;
  }

  return (
    <div className="flex items-start gap-2.5 border-b border-line bg-accent-soft/60 px-3 py-2.5" role="status">
      <UserRound className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-xs">{t("profiles.hint.message", { owner: context.remote.owner, label: suggestion.label })}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => showApply({ repoPath, profile: suggestion })}>
            {t("profiles.hint.use")}
          </Button>
          <Button size="sm" onClick={() => ignoreHint(repoPath)}>
            {t("profiles.hint.never")}
          </Button>
        </div>
      </div>
    </div>
  );
}
