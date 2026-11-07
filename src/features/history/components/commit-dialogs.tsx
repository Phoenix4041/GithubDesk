import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { resetCurrentBranchTo, revertSingleCommit } from "../commit-actions";
import { useCommitDialogStore } from "../commit-dialog-store";
import type { CommitSummary } from "@/shared/types/git";

interface CommitDialogsProps {
  repoPath: string;
}

interface RevertMergeDialogProps {
  repoPath: string;
  commit: CommitSummary;
  onClose: () => void;
}

function RevertMergeDialog({ repoPath, commit, onClose }: RevertMergeDialogProps) {
  const { t } = useTranslation();
  const [mainline, setMainline] = useState(1);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    const succeeded = await revertSingleCommit(repoPath, commit.hash, mainline);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("commitActions.revertMerge.title", { hash: commit.shortHash })}
      description={t("commitActions.revertMerge.description")}
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="revert-merge-form" loading={busy}>
            {t("commitActions.revertMerge.submit")}
          </Button>
        </>
      }
    >
      <form id="revert-merge-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium">{t("commitActions.revertMerge.parentLabel")}</legend>
          {commit.parents.map((parent, index) => (
            <label key={parent} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="mainline"
                data-autofocus={index === 0 ? true : undefined}
                checked={mainline === index + 1}
                onChange={() => setMainline(index + 1)}
                className="size-3.5 cursor-pointer accent-accent"
              />
              <span>{t("commitActions.revertMerge.parent", { number: index + 1 })}</span>
              <span className="font-mono text-[11px] text-muted">{parent.slice(0, 7)}</span>
            </label>
          ))}
        </fieldset>
      </form>
    </Dialog>
  );
}

export function CommitDialogs({ repoPath }: CommitDialogsProps) {
  const { t } = useTranslation();
  const dialog = useCommitDialogStore((state) => state.dialog);
  const hide = useCommitDialogStore((state) => state.hide);
  const [busy, setBusy] = useState(false);

  async function confirmHardReset(hash: string) {
    setBusy(true);
    const succeeded = await resetCurrentBranchTo(repoPath, hash, "hard");
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  if (!dialog) {
    return null;
  }
  if (dialog.kind === "revertMerge") {
    return <RevertMergeDialog key={dialog.commit.hash} repoPath={repoPath} commit={dialog.commit} onClose={hide} />;
  }
  return (
    <ConfirmDialog
      open
      title={t("commitActions.reset.hard.title", { hash: dialog.commit.shortHash })}
      description={t("commitActions.reset.hard.description")}
      consequences={[t("commitActions.reset.hard.lossChanges"), t("commitActions.reset.hard.lossCommits")]}
      confirmLabel={t("commitActions.reset.hard.confirm")}
      destructive
      loading={busy}
      onConfirm={() => void confirmHardReset(dialog.commit.hash)}
      onCancel={hide}
    />
  );
}
