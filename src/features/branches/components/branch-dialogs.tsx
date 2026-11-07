import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { createAndSwitchBranch, deleteExistingBranch, renameExistingBranch } from "../actions";
import { useBranchDialogStore } from "../dialog-store";
import type { BranchStartPoint } from "../dialog-store";

interface BranchDialogsProps {
  repoPath: string;
}

interface NameDialogProps {
  repoPath: string;
  onClose: () => void;
}

interface CreateBranchDialogProps extends NameDialogProps {
  startPoint?: BranchStartPoint;
}

function CreateBranchDialog({ repoPath, startPoint, onClose }: CreateBranchDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [checkout, setCheckout] = useState(true);
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const succeeded = await createAndSwitchBranch(repoPath, name.trim(), checkout, startPoint?.hash ?? null);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("branches.createDialog.title")}
      description={
        startPoint
          ? t("branches.createDialog.descriptionAt", { target: startPoint.label })
          : t("branches.createDialog.description")
      }
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-branch-form" disabled={!canSubmit} loading={busy}>
            {t("branches.createDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="create-branch-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("branches.createDialog.name")}
          placeholder="feature/mi-cambio"
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={checkout}
            onChange={(event) => setCheckout(event.target.checked)}
            className="size-3.5 cursor-pointer accent-accent"
          />
          {t("branches.createDialog.checkout")}
        </label>
      </form>
    </Dialog>
  );
}

interface RenameBranchDialogProps extends NameDialogProps {
  currentName: string;
}

function RenameBranchDialog({ repoPath, currentName, onClose }: RenameBranchDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0 && name.trim() !== currentName;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const succeeded = await renameExistingBranch(repoPath, currentName, name.trim());
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("branches.renameDialog.title", { name: currentName })}
      description={t("branches.renameDialog.description")}
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="rename-branch-form" disabled={!canSubmit} loading={busy}>
            {t("branches.renameDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="rename-branch-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <TextField
          data-autofocus
          label={t("branches.renameDialog.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
      </form>
    </Dialog>
  );
}

export function BranchDialogs({ repoPath }: BranchDialogsProps) {
  const { t } = useTranslation();
  const dialog = useBranchDialogStore((state) => state.dialog);
  const hide = useBranchDialogStore((state) => state.hide);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete(name: string, force: boolean) {
    setDeleting(true);
    const succeeded = await deleteExistingBranch(repoPath, name, force);
    setDeleting(false);
    if (succeeded) {
      hide();
    }
  }

  if (!dialog) {
    return null;
  }
  if (dialog.kind === "create") {
    return <CreateBranchDialog repoPath={repoPath} startPoint={dialog.startPoint} onClose={hide} />;
  }
  if (dialog.kind === "rename") {
    return <RenameBranchDialog key={dialog.name} repoPath={repoPath} currentName={dialog.name} onClose={hide} />;
  }

  return (
    <ConfirmDialog
      open
      title={dialog.force ? t("branches.forceDelete.title", { name: dialog.name }) : t("branches.deleteDialog.title", { name: dialog.name })}
      description={dialog.force ? t("branches.forceDelete.description") : t("branches.deleteDialog.description")}
      consequences={
        dialog.force
          ? [t("branches.forceDelete.loss"), t("branches.forceDelete.noUndo")]
          : [t("branches.deleteDialog.loss")]
      }
      confirmLabel={dialog.force ? t("branches.forceDelete.confirm") : t("branches.deleteDialog.confirm")}
      destructive
      loading={deleting}
      onConfirm={() => void confirmDelete(dialog.name, dialog.force)}
      onCancel={hide}
    />
  );
}
