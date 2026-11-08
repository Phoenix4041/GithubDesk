import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { Button } from "@/shared/ui/button";
import { chooseProfile } from "../actions";
import { useProfileDialogStore } from "../dialog-store";
import { identityIsMissing, identityMatches } from "../profile-model";
import { useIdentity } from "../queries";

export function IdentityLine({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const identity = useIdentity(repoPath);
  const profiles = useSettingsStore((state) => state.profiles);
  const boundId = useSettingsStore((state) => state.repoProfiles[repoPath]);
  const showPicker = useProfileDialogStore((state) => state.showPicker);

  if (!identity.data) {
    return null;
  }
  const data = identity.data;
  const bound = profiles.find((profile) => profile.id === boundId) ?? null;
  const missing = identityIsMissing(data);
  const mismatch = bound !== null && !missing && !identityMatches(data, bound);

  return (
    <div className="flex flex-col gap-1" aria-label={t("profiles.identity.label")}>
      {missing ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-warning/15 px-2.5 py-1.5 text-xs text-warning" role="status">
          <span>{t("profiles.identity.missing")}</span>
          <Button size="sm" onClick={showPicker}>
            {t("profiles.identity.choose")}
          </Button>
        </div>
      ) : (
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted" title={data.email?.value}>
          <UserRound className="size-3 shrink-0" aria-hidden="true" />
          <span className="selectable truncate">
            {t("profiles.identity.as", { name: data.name?.value ?? "", email: data.email?.value ?? "" })}
          </span>
        </p>
      )}
      {mismatch && bound ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-warning/15 px-2.5 py-1.5 text-xs text-warning" role="status">
          <span>{t("profiles.identity.mismatch", { label: bound.label })}</span>
          <Button size="sm" onClick={() => chooseProfile(repoPath, bound)}>
            {t("profiles.identity.apply", { label: bound.label })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
