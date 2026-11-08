import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/features/github/queries";
import type { Identity } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { applyProfileToRepo } from "../actions";
import { useProfileDialogStore } from "../dialog-store";
import type { ApplyTarget } from "../dialog-store";
import type { Profile } from "../profile-model";
import { useIdentity } from "../queries";

function describeCurrent(identity: Identity | undefined, missing: string): string {
  if (!identity || (!identity.name && !identity.email)) {
    return missing;
  }
  return `${identity.name?.value ?? "?"} <${identity.email?.value ?? "?"}>`;
}

function describeProfile(profile: Profile): string {
  return `${profile.name} <${profile.email}>`;
}

function ApplyForm({ target, onClose }: { target: ApplyTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const identity = useIdentity(target.repoPath);
  const accounts = useAccounts();
  const [busy, setBusy] = useState(false);
  const account = accounts.data?.find((candidate) => candidate.id === target.profile.accountId);

  async function confirm() {
    setBusy(true);
    const applied = await applyProfileToRepo(target.repoPath, target.profile);
    setBusy(false);
    if (applied) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("profiles.apply.title", { label: target.profile.label })}
      description={t("profiles.apply.description", { login: account?.login ?? "?" })}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void confirm()} loading={busy}>
            {t("profiles.apply.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <dl className="flex flex-col gap-2 rounded-md border border-line px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted">{t("profiles.apply.before")}</dt>
            <dd className="selectable font-mono text-xs">{describeCurrent(identity.data, t("profiles.apply.missingIdentity"))}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted">{t("profiles.apply.after")}</dt>
            <dd className="selectable font-mono text-xs">{describeProfile(target.profile)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted">{t("profiles.apply.signing")}</dt>
            <dd className="text-xs">
              {target.profile.signingKey
                ? t("profiles.apply.signingOn", { key: target.profile.signingKey })
                : t("profiles.apply.signingOff")}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted">{t("profiles.apply.note")}</p>
      </div>
    </Dialog>
  );
}

export function ApplyProfileDialog({ repoPath }: { repoPath: string }) {
  const target = useProfileDialogStore((state) => state.applying);
  const hide = useProfileDialogStore((state) => state.hideApply);
  if (!target || target.repoPath !== repoPath) {
    return null;
  }
  return <ApplyForm key={target.profile.id} target={target} onClose={hide} />;
}
