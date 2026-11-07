import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import { createNewTag, deleteLocalTag, deleteTagOnRemote } from "../actions";
import { useTagDialogStore } from "../dialog-store";
import type { TagTarget } from "../dialog-store";

interface TagDialogsProps {
  repoPath: string;
}

interface CreateTagDialogProps {
  repoPath: string;
  target: TagTarget | null;
  onClose: () => void;
}

function CreateTagDialog({ repoPath, target, onClose }: CreateTagDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const succeeded = await createNewTag(repoPath, name.trim(), target?.hash ?? null, message.trim() || null);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("tags.createDialog.title")}
      description={
        target ? t("tags.createDialog.descriptionAt", { target: target.label }) : t("tags.createDialog.descriptionHead")
      }
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-tag-form" disabled={!canSubmit} loading={busy}>
            {t("tags.createDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="create-tag-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("tags.createDialog.name")}
          placeholder="v1.0.0"
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
        <TextAreaField
          label={t("tags.createDialog.message")}
          hint={t("tags.createDialog.messageHint")}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </form>
    </Dialog>
  );
}

export function TagDialogs({ repoPath }: TagDialogsProps) {
  const { t } = useTranslation();
  const dialog = useTagDialogStore((state) => state.dialog);
  const hide = useTagDialogStore((state) => state.hide);
  const [busy, setBusy] = useState(false);

  async function confirm(action: () => Promise<boolean>) {
    setBusy(true);
    const succeeded = await action();
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  if (!dialog) {
    return null;
  }
  if (dialog.kind === "create") {
    return <CreateTagDialog repoPath={repoPath} target={dialog.target} onClose={hide} />;
  }
  if (dialog.kind === "delete") {
    return (
      <ConfirmDialog
        open
        title={t("tags.deleteDialog.title", { name: dialog.name })}
        description={t("tags.deleteDialog.description")}
        confirmLabel={t("tags.deleteDialog.confirm")}
        destructive
        loading={busy}
        onConfirm={() => void confirm(() => deleteLocalTag(repoPath, dialog.name))}
        onCancel={hide}
      />
    );
  }
  return (
    <ConfirmDialog
      open
      title={t("tags.deleteRemoteDialog.title", { name: dialog.name })}
      description={t("tags.deleteRemoteDialog.description")}
      consequences={[t("tags.deleteRemoteDialog.loss")]}
      confirmLabel={t("tags.deleteRemoteDialog.confirm")}
      destructive
      loading={busy}
      onConfirm={() => void confirm(() => deleteTagOnRemote(repoPath, dialog.name))}
      onCancel={hide}
    />
  );
}
