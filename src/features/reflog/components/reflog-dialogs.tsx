import { GitBranchPlus, History } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBranchDialogStore } from "@/features/branches/dialog-store";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import type { ReflogEntry, UndoPlan } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { restoreToReflogEntry, undoLatestOperation } from "../actions";
import { useReflog, useUndoPlan } from "../queries";
import { useReflogDialogStore } from "../store";

const ROW_HEIGHT = 48;

interface ReflogDialogsProps {
  repoPath: string;
}

function ReflogListDialog({ repoPath }: ReflogDialogsProps) {
  const { t, i18n } = useTranslation();
  const hide = useReflogDialogStore((state) => state.hide);
  const show = useReflogDialogStore((state) => state.show);
  const showBranchDialog = useBranchDialogStore((state) => state.show);
  const reflog = useReflog(repoPath, true);

  function createBranchAt(entry: ReflogEntry) {
    hide();
    showBranchDialog({ kind: "create", startPoint: { hash: entry.hash, label: entry.shortHash } });
  }

  let body;
  if (reflog.isPending) {
    body = <SkeletonRows count={6} rowHeight={ROW_HEIGHT} />;
  } else if (reflog.isError) {
    const description = describeError(reflog.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void reflog.refetch()} />;
  } else if (reflog.data.length === 0) {
    body = (
      <EmptyState icon={<History className="size-5" />} title={t("reflog.empty.title")} description={t("reflog.empty.description")} />
    );
  } else {
    body = (
      <div className="flex h-[52vh] min-h-[240px] flex-col">
        <VirtualList
          items={reflog.data}
          rowHeight={ROW_HEIGHT}
          ariaLabel={t("reflog.listLabel")}
          getKey={(entry) => entry.index}
          renderRow={(entry) => (
            <div className="group mx-1 flex h-[calc(100%-2px)] items-center gap-3 rounded-md px-2 transition-colors duration-150 hover:bg-subtle">
              <span className="w-[112px] shrink-0 truncate rounded bg-accent-soft px-1.5 py-0.5 text-center text-[11px] font-medium text-accent">
                {t(`reflog.actions.${entry.action}`)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium" title={entry.message}>
                  {entry.message}
                </span>
                <span className="text-[11px] text-muted">
                  <span className="font-mono">{entry.shortHash}</span> &middot; {formatRelativeTime(entry.time, i18n.language)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                {entry.index > 0 ? (
                  <Button size="sm" onClick={() => show({ kind: "restore", entry })}>
                    {t("reflog.restore")}
                  </Button>
                ) : null}
                <Button size="sm" icon={<GitBranchPlus className="size-3.5" />} onClick={() => createBranchAt(entry)}>
                  {t("reflog.createBranch")}
                </Button>
              </div>
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <Dialog open title={t("reflog.title")} description={t("reflog.description")} onClose={hide} width="lg" footer={<Button onClick={hide}>{t("common.close")}</Button>}>
      {body}
    </Dialog>
  );
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

function UndoDialog({ repoPath, plan }: ReflogDialogsProps & { plan: UndoPlan }) {
  const { t } = useTranslation();
  const hide = useReflogDialogStore((state) => state.hide);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const succeeded = await undoLatestOperation(repoPath, plan.currentHash);
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  const effect =
    plan.strategy === "keepChangesStaged"
      ? t("reflog.undoDialog.effectStaged", { hash: plan.targetShortHash })
      : t("reflog.undoDialog.effectRestore", { hash: plan.targetShortHash });

  return (
    <ConfirmDialog
      open
      title={t("reflog.undoDialog.title")}
      description={t("reflog.undoDialog.description", {
        action: t(`reflog.actions.${plan.action}`),
        message: plan.message,
      })}
      consequences={[effect, t("reflog.undoDialog.safety")]}
      confirmLabel={t("reflog.undoDialog.confirm")}
      destructive
      loading={busy}
      onConfirm={() => void confirm()}
      onCancel={hide}
    />
  );
}

export function ReflogDialogs({ repoPath }: ReflogDialogsProps) {
  const dialog = useReflogDialogStore((state) => state.dialog);
  const plan = useUndoPlan(repoPath);

  if (!dialog) {
    return null;
  }
  if (dialog.kind === "list") {
    return <ReflogListDialog repoPath={repoPath} />;
  }
  if (dialog.kind === "restore") {
    return <RestoreDialog key={dialog.entry.hash} repoPath={repoPath} entry={dialog.entry} />;
  }
  if (!plan.data) {
    return null;
  }
  return <UndoDialog repoPath={repoPath} plan={plan.data} />;
}
