import { useState } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import type { UndoPreview, UndoPreviewCommit } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { undoLatestOperation } from "../actions";
import { useUndoPreview } from "../queries";
import { useReflogDialogStore } from "../store";

interface ReflogUndoDialogProps {
  repoPath: string;
}

interface CommitListProps {
  title: string;
  commits: UndoPreviewCommit[];
}

function CommitList({ title, commits }: CommitListProps) {
  if (commits.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium">{title}</h3>
      <ul className="max-h-32 overflow-y-auto rounded-md border border-line">
        {commits.map((commit) => (
          <li key={commit.hash} className="flex items-center gap-2 px-2 py-1 text-[12px]">
            <span className="font-mono text-muted">{commit.shortHash}</span>
            <span className="truncate" title={commit.subject}>
              {commit.subject}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReflogUndoDialog({ repoPath }: ReflogUndoDialogProps) {
  const { t } = useTranslation();
  const hide = useReflogDialogStore((state) => state.hide);
  const preview = useUndoPreview(repoPath, true);
  const [stash, setStash] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = preview.data ?? null;
  const losesChanges = data !== null && data.hasUncommittedChanges && data.plan.strategy !== "keepChangesStaged";
  const canConfirm = data !== null && (!losesChanges || stash);

  async function confirm() {
    if (!data) {
      return;
    }
    setBusy(true);
    const succeeded = await undoLatestOperation(repoPath, data.plan.currentHash, stash);
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  function effectText(current: UndoPreview): string {
    const { plan } = current;
    if (plan.strategy === "switchBack") {
      return t("reflog.undoPreview.switchBack", { ref: plan.switchTo ?? plan.targetShortHash });
    }
    if (plan.strategy === "keepChangesStaged") {
      return t("reflog.undoDialog.effectStaged", { hash: plan.targetShortHash });
    }
    return t("reflog.undoDialog.effectRestore", { hash: plan.targetShortHash });
  }

  let body;
  if (preview.isPending) {
    body = <SkeletonRows count={4} rowHeight={28} />;
  } else if (preview.isError) {
    const description = describeError(preview.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void preview.refetch()} />;
  } else if (!data) {
    body = null;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[13px]">{effectText(data)}</p>
        <CommitList title={t("reflog.undoPreview.removed", { count: String(data.removedCommits.length) })} commits={data.removedCommits} />
        <CommitList title={t("reflog.undoPreview.restored", { count: String(data.restoredCommits.length) })} commits={data.restoredCommits} />
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-medium">{t("reflog.undoPreview.files", { count: String(data.files.length) })}</h3>
          {data.files.length === 0 ? (
            <p className="text-[12px] text-muted">{t("reflog.undoPreview.noFiles")}</p>
          ) : (
            <ul className="max-h-32 overflow-y-auto rounded-md border border-line">
              {data.files.map((file) => (
                <li key={file.path} className="flex items-center gap-2 px-2 py-1 text-[12px]">
                  <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                    {file.path}
                  </span>
                  <span className="text-success">+{file.additions}</span>
                  <span className="text-danger">-{file.deletions}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {losesChanges ? (
          <div role="alert" className="flex flex-col gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-[12px]">
            <p>{t("reflog.undoPreview.dirty")}</p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={stash}
                onChange={(event) => setStash(event.target.checked)}
                className="size-3.5 cursor-pointer accent-accent"
              />
              {t("reflog.undoPreview.stash")}
            </label>
            {stash ? null : <p className="text-muted">{t("reflog.undoPreview.needStash")}</p>}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog
      open
      title={t("reflog.undoPreview.title")}
      description={
        data
          ? t("reflog.undoPreview.description", {
              action: t(`reflog.actions.${data.plan.action}`),
              message: data.plan.message,
            })
          : undefined
      }
      onClose={hide}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={hide} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={!canConfirm} loading={busy}>
            {t("reflog.undoDialog.confirm")}
          </Button>
        </>
      }
    >
      {body}
    </Dialog>
  );
}
