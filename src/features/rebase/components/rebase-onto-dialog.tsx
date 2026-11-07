import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BranchChooser } from "@/features/branches/components/branch-chooser";
import { useStatus } from "@/features/changes/queries";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { rebaseOntoBranch } from "../actions";
import { useRebaseOntoPreview } from "../queries";
import { useRebaseOntoStore } from "../store";

interface FormProps {
  repoPath: string;
  target: string;
  onClose: () => void;
}

function RebaseOntoForm({ repoPath, target, onClose }: FormProps) {
  const { t } = useTranslation();
  const preview = useRebaseOntoPreview(repoPath, target);
  const status = useStatus(repoPath);
  const current = status.data?.branch.head ?? "";
  const [keepMerges, setKeepMerges] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = preview.data;
  const blocked = !data || data.upToDate;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || busy) {
      return;
    }
    setBusy(true);
    const result = await rebaseOntoBranch(repoPath, target, keepMerges && data.hasMerges);
    setBusy(false);
    if (result !== "failed") {
      onClose();
    }
  }

  let summary;
  if (preview.isPending) {
    summary = <Skeleton className="h-16" />;
  } else if (preview.isError) {
    const description = describeError(preview.error);
    summary = <ErrorState title={description.title} message={description.message} onRetry={() => void preview.refetch()} />;
  } else if (preview.data.upToDate) {
    summary = <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted">{t("rebaseOnto.upToDate", { target })}</p>;
  } else {
    summary = (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          {t("rebaseOnto.commitsToReplay", { count: preview.data.replay })} {t("rebaseOnto.incoming", { count: preview.data.incoming })}
        </p>
        {preview.data.conflicts.length > 0 ? (
          <div className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning" role="status">
            <p className="font-medium">{t("rebaseOnto.conflictsExpected", { count: preview.data.conflicts.length })}</p>
            <ul className="mt-1 max-h-20 overflow-y-auto font-mono text-[11px]">
              {preview.data.conflicts.map((path) => (
                <li key={path} className="truncate">
                  {path}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-add">{t("rebaseOnto.noConflicts")}</p>
        )}
        <p className="flex items-start gap-2 rounded-md bg-subtle px-3 py-2 text-xs text-muted">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
          {t("rebaseOnto.rewrites")}
        </p>
      </div>
    );
  }

  return (
    <Dialog
      open
      title={t("rebaseOnto.title", { current, target })}
      description={t("rebaseOnto.description")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="rebase-onto-form" disabled={blocked} loading={busy}>
            {t("rebaseOnto.submit")}
          </Button>
        </>
      }
    >
      <form id="rebase-onto-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {summary}
        {data?.hasMerges ? (
          <div className="flex flex-col gap-1">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={keepMerges}
                onChange={(event) => setKeepMerges(event.target.checked)}
                className="size-3.5 cursor-pointer accent-accent"
              />
              {t("rebaseOnto.keepMerges")}
            </label>
            <p className="pl-5 text-xs text-muted">{t("rebaseOnto.keepMergesHint")}</p>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

export function RebaseOntoDialog({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const target = useRebaseOntoStore((state) => state.target);
  const choosing = useRebaseOntoStore((state) => state.choosing);
  const show = useRebaseOntoStore((state) => state.show);
  const hide = useRebaseOntoStore((state) => state.hide);
  if (target) {
    return <RebaseOntoForm key={target} repoPath={repoPath} target={target} onClose={hide} />;
  }
  return choosing ? (
    <BranchChooser
      repoPath={repoPath}
      title={t("rebaseOnto.chooseTitle")}
      description={t("rebaseOnto.chooseDescription")}
      onChoose={show}
      onCancel={hide}
    />
  ) : null;
}
