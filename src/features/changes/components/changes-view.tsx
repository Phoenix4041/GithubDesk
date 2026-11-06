import { CircleCheckBig, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { abortCurrentMerge } from "../actions";
import { buildChangeModel, findRow, firstFileRow } from "../change-model";
import type { ChangeSection } from "../change-model";
import { useStatus } from "../queries";
import { useChangesStore } from "../store";
import { ChangeList } from "./change-list";
import { CommitBox } from "./commit-box";

interface ChangesViewProps {
  repoPath: string;
}

const SECTIONS: ChangeSection[] = ["conflicts", "staged", "unstaged"];

export function ChangesView({ repoPath }: ChangesViewProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const selected = useChangesStore((state) => state.selected);
  const select = useChangesStore((state) => state.select);
  const [confirmingAbort, setConfirmingAbort] = useState(false);
  const [aborting, setAborting] = useState(false);

  const model = useMemo(() => buildChangeModel(status.data?.entries ?? []), [status.data]);
  const showSkeleton = useSkeletonVisible(status.isPending);

  useEffect(() => {
    if (!status.data) {
      return;
    }
    if (selected && findRow(model.rows, selected.section, selected.path)) {
      return;
    }
    const sameFile = selected
      ? SECTIONS.map((section) => findRow(model.rows, section, selected.path)).find((row) => row !== null && row !== undefined)
      : null;
    const next = sameFile ?? firstFileRow(model.rows);
    select(next ? { section: next.section, path: next.entry.path } : null);
  }, [status.data, model.rows, selected, select]);

  async function confirmAbort() {
    setAborting(true);
    await abortCurrentMerge(repoPath);
    setAborting(false);
    setConfirmingAbort(false);
  }

  if (showSkeleton) {
    return <SkeletonRows count={9} className="flex-1" />;
  }
  if (status.isPending) {
    return <div className="flex-1" />;
  }
  if (status.isError) {
    const description = describeError(status.error);
    return (
      <ErrorState
        title={description.title}
        message={description.message}
        onRetry={() => void status.refetch()}
      />
    );
  }

  const snapshot = status.data;
  const branchName = snapshot.branch.head;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {model.conflicts.length > 0 ? (
        <div className="flex items-start gap-2.5 border-b border-line bg-danger-soft px-3 py-2.5" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="text-xs font-medium">{t("changes.conflictBanner.title", { count: model.conflicts.length })}</p>
            <p className="text-xs text-muted">{t("changes.conflictBanner.description")}</p>
            <div>
              <Button size="sm" onClick={() => setConfirmingAbort(true)}>
                {t("changes.conflictBanner.abort")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {model.rows.length === 0 ? (
        <EmptyState
          icon={<CircleCheckBig className="size-5" />}
          title={t("changes.empty.title")}
          description={
            snapshot.branch.ahead > 0
              ? t("changes.empty.ahead", { count: snapshot.branch.ahead })
              : t("changes.empty.description")
          }
        />
      ) : (
        <ChangeList repoPath={repoPath} model={model} />
      )}
      <CommitBox
        repoPath={repoPath}
        branchName={branchName}
        stagedCount={model.staged.length}
        conflictCount={model.conflicts.length}
      />
      <ConfirmDialog
        open={confirmingAbort}
        title={t("changes.abortMerge.title")}
        description={t("changes.abortMerge.description")}
        consequences={[t("changes.abortMerge.loss")]}
        confirmLabel={t("changes.abortMerge.confirm")}
        destructive
        loading={aborting}
        onConfirm={() => void confirmAbort()}
        onCancel={() => setConfirmingAbort(false)}
      />
    </div>
  );
}
