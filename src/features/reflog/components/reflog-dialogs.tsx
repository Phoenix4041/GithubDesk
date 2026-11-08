import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReflogEntry } from "@/shared/types/git";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { restoreToReflogEntry } from "../actions";
import { useReflogDialogStore } from "../store";
import { ReflogRecoverDialog } from "./reflog-recover-dialog";
import { ReflogTimeline } from "./reflog-timeline";
import { ReflogUndoDialog } from "./reflog-undo-dialog";

interface ReflogDialogsProps {
  repoPath: string;
}

function RestoreDialog({ repoPath, entry }: ReflogDialogsProps & { entry: ReflogEntry }) {
  const { t } = useTranslation();
  const hide = useReflogDialogStore((state) => state.hide);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const succeeded = await restoreToReflogEntry(repoPath, entry.hash);
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  return (
    <ConfirmDialog
      open
      title={t("reflog.restoreDialog.title", { hash: entry.shortHash })}
      description={t("reflog.restoreDialog.description", { message: entry.message })}
      consequences={[t("reflog.restoreDialog.effect"), t("reflog.restoreDialog.safety")]}
      confirmLabel={t("reflog.restoreDialog.confirm")}
      destructive
      loading={busy}
      onConfirm={() => void confirm()}
      onCancel={hide}
    />
  );
}

export function ReflogDialogs({ repoPath }: ReflogDialogsProps) {
  const dialog = useReflogDialogStore((state) => state.dialog);

  if (!dialog) {
    return null;
  }
  if (dialog.kind === "list") {
    return <ReflogTimeline repoPath={repoPath} />;
  }
  if (dialog.kind === "restore") {
    return <RestoreDialog key={dialog.entry.hash} repoPath={repoPath} entry={dialog.entry} />;
  }
  if (dialog.kind === "recover") {
    return <ReflogRecoverDialog key={dialog.entry.hash} repoPath={repoPath} entry={dialog.entry} />;
  }
  return <ReflogUndoDialog repoPath={repoPath} />;
}
