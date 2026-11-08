import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/features/github/queries";
import { useSettingsStore } from "@/features/settings/store";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { useProfileDialogStore } from "../dialog-store";
import { newProfileId } from "../profile-model";
import type { Profile, ProfileDraft } from "../profile-model";
import { ProfileEditor } from "./profile-editor";

type Editing = { kind: "new" } | { kind: "edit"; profile: Profile } | null;

function ProfilesForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const profiles = useSettingsStore((state) => state.profiles);
  const addProfile = useSettingsStore((state) => state.addProfile);
  const updateProfile = useSettingsStore((state) => state.updateProfile);
  const deleteProfile = useSettingsStore((state) => state.deleteProfile);
  const accounts = useAccounts();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<Profile | null>(null);

  function save(draft: ProfileDraft) {
    if (editing?.kind === "edit") {
      updateProfile({ ...draft, id: editing.profile.id });
    } else {
      addProfile({ ...draft, id: newProfileId() });
    }
    setEditing(null);
  }

  return (
    <Dialog
      open
      title={t("profiles.dialog.title")}
      description={t("profiles.dialog.description")}
      onClose={onClose}
      width="md"
      footer={
        editing ? null : (
          <>
            <Button onClick={onClose}>{t("common.close")}</Button>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ kind: "new" })}>
              {t("profiles.dialog.new")}
            </Button>
          </>
        )
      }
    >
      {editing ? (
        <ProfileEditor
          key={editing.kind === "edit" ? editing.profile.id : "new"}
          initial={editing.kind === "edit" ? editing.profile : null}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : profiles.length === 0 ? (
        <p className="text-xs text-muted">{t("profiles.dialog.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label={t("profiles.dialog.listLabel")}>
          {profiles.map((profile) => {
            const account = accounts.data?.find((candidate) => candidate.id === profile.accountId);
            return (
              <li key={profile.id} className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-2">
                <Avatar url={account?.avatarUrl} name={account?.login ?? profile.label} size={28} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">
                    {profile.label}
                    {profile.org ? <span className="font-normal text-muted"> &middot; {profile.org}</span> : null}
                  </span>
                  <span className="selectable truncate text-[11px] text-muted">
                    {profile.name} &lt;{profile.email}&gt;
                    {account ? ` · @${account.login}` : ""}
                  </span>
                </div>
                <IconButton label={t("profiles.dialog.edit", { label: profile.label })} onClick={() => setEditing({ kind: "edit", profile })}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={t("profiles.dialog.remove", { label: profile.label })} onClick={() => setRemoving(profile)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t("profiles.dialog.removeTitle", { label: removing?.label ?? "" })}
        description={t("profiles.dialog.removeDescription")}
        confirmLabel={t("profiles.dialog.removeConfirm")}
        destructive
        onConfirm={() => {
          if (removing) {
            deleteProfile(removing.id);
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Dialog>
  );
}

export function ProfilesDialog() {
  const open = useProfileDialogStore((state) => state.manageOpen);
  const hide = useProfileDialogStore((state) => state.hideManage);
  if (!open) {
    return null;
  }
  return <ProfilesForm onClose={hide} />;
}
