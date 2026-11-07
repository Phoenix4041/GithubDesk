import { FileSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffHeader } from "@/features/diff/components/diff-header";
import { ConflictEditor } from "@/features/conflicts/components/conflict-editor";
import { DiffViewer } from "@/features/diff/components/diff-viewer";
import type { StagingControls } from "@/features/diff/staging-controls";
import { useSettingsStore } from "@/features/settings/store";
import { describeError } from "@/shared/lib/report-error";
import type { LineSelection } from "@/shared/types/git";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { stageLines, unstageLines } from "../actions";
import { buildChangeModel, diffSourceFor, effectiveChange, findRow } from "../change-model";
import { useFileDiff, useStatus } from "../queries";
import { useChangesStore } from "../store";
import { ChangeKindBadge } from "./change-badge";

interface ChangesDiffPanelProps {
  repoPath: string;
}

export function ChangesDiffPanel({ repoPath }: ChangesDiffPanelProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const selected = useChangesStore((state) => state.selected);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);
  const [busy, setBusy] = useState(false);

  const row = useMemo(() => {
    if (!selected || !status.data) {
      return null;
    }
    return findRow(buildChangeModel(status.data.entries).rows, selected.section, selected.path);
  }, [selected, status.data]);

  const target = row
    ? {
        path: row.entry.path,
        originalPath: row.entry.originalPath,
        source: diffSourceFor(row.section, row.entry),
      }
    : null;

  const isConflict = row?.section === "conflicts";
  const diffQuery = useFileDiff(repoPath, isConflict ? null : target, ignoreWhitespace);
  const showSkeleton = useSkeletonVisible(diffQuery.isPending && target !== null);

  if (!row || !target) {
    return (
      <EmptyState
        icon={<FileSearch className="size-5" />}
        title={t("diff.nothingSelected.title")}
        description={t("diff.nothingSelected.description")}
      />
    );
  }

  if (isConflict) {
    return <ConflictEditor key={row.entry.path} repoPath={repoPath} path={row.entry.path} />;
  }

  const kind = effectiveChange(row.section, row.entry);
  const header = (
    <DiffHeader path={row.entry.path} badge={<ChangeKindBadge kind={kind} label={t(`changes.kind.${kind}`)} />} />
  );

  if (showSkeleton) {
    return (
      <>
        {header}
        <SkeletonRows count={14} rowHeight={20} />
      </>
    );
  }
  if (diffQuery.isPending) {
    return header;
  }
  if (diffQuery.isError) {
    const description = describeError(diffQuery.error);
    return (
      <>
        {header}
        <ErrorState title={description.title} message={description.message} onRetry={() => void diffQuery.refetch()} />
      </>
    );
  }

  const diff = diffQuery.data;
  const mode = row.section === "staged" ? "unstage" : "stage";

  async function apply(selections: LineSelection[]) {
    setBusy(true);
    if (mode === "stage") {
      await stageLines(repoPath, diff, selections);
    } else {
      await unstageLines(repoPath, diff, selections);
    }
    setBusy(false);
  }

  const staging: StagingControls | undefined =
    row.section === "conflicts" || target.source === "raw"
      ? undefined
      : { mode, busy, onApply: (selections) => void apply(selections) };

  return (
    <>
      {header}
      <DiffViewer diff={diff} staging={staging} />
    </>
  );
}
