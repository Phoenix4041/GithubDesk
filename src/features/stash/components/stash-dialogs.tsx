import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { createBranchFromStash, dropStashEntry, saveToStash } from "../actions";
import { useStashDialogStore } from "../store";

interface StashDialogsProps {
  repoPath: string;
}

interface SaveDialogProps {
  repoPath: string;
  onClose: () => void;
}

function SaveStashDialog({ repoPath, onClose }: SaveDialogProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    const succeeded = await saveToStash(repoPath, message, includeUntracked);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("stash.saveDialog.title")}
      description={t("stash.saveDialog.description")}
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="save-stash-form" loading={busy}>
            {t("stash.saveDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="save-stash-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("stash.saveDialog.message")}
          placeholder={t("stash.saveDialog.placeholder")}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeUntracked}
            onChange={(event) => setIncludeUntracked(event.target.checked)}
            className="size-3.5 cursor-pointer accent-accent"
          />
          {t("stash.saveDialog.includeUntracked")}
        </label>
      </form>
    </Dialog>
  );
}

interface BranchDialogProps extends SaveDialogProps {
  hash: string;
}

function StashBranchDialog({ repoPath, hash, onClose }: BranchDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const succeeded = await createBranchFromStash(repoPath, hash, name.trim());
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("stash.branchDialog.title")}
      description={t("stash.branchDialog.description")}
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="stash-branch-form" disabled={!canSubmit} loading={busy}>
            {t("stash.branchDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="stash-branch-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("branches.createDialog.name")}
          placeholder="feature/desde-stash"
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
      </form>
    </Dialog>
  );
}

export function StashDialogs({ repoPath }: StashDialogsProps) {
  const { t } = useTranslation();
  const dialog = useStashDialogStore((state) => state.dialog);
  const hide = useStashDialogStore((state) => state.hide);
  const [busy, setBusy] = useState(false);

  async function confirmDrop(hash: string) {
    setBusy(true);
    const succeeded = await dropStashEntry(repoPath, hash);
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  if (!dialog) {
    return null;
  }
  if (dialog.kind === "save") {
    return <SaveStashDialog repoPath={repoPath} onClose={hide} />;
  }
  if (dialog.kind === "branch") {
    return <StashBranchDialog key={dialog.stash.hash} repoPath={repoPath} hash={dialog.stash.hash} onClose={hide} />;
  }
  return (
    <ConfirmDialog
      open
      title={t("stash.dropDialog.title")}
      description={t("stash.dropDialog.description", { message: dialog.stash.message })}
      consequences={[t("stash.dropDialog.loss")]}
      confirmLabel={t("stash.dropDialog.confirm")}
      destructive
      loading={busy}
      onConfirm={() => void confirmDrop(dialog.stash.hash)}
      onCancel={hide}
    />
  );
}
