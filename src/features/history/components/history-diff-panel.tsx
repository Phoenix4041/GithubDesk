import { FileSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DiffHeader } from "@/features/diff/components/diff-header";
import { DiffViewer } from "@/features/diff/components/diff-viewer";
import { describeError } from "@/shared/lib/report-error";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { useCommitFileDiff } from "../queries";
import { useHistoryStore } from "../store";

interface HistoryDiffPanelProps {
  repoPath: string;
}

export function HistoryDiffPanel({ repoPath }: HistoryDiffPanelProps) {
  const { t } = useTranslation();
  const selectedHash = useHistoryStore((state) => state.selectedHash);
  const selectedFile = useHistoryStore((state) => state.selectedFile);

  const target =
    selectedHash && selectedFile
      ? { hash: selectedHash, path: selectedFile.path, oldPath: selectedFile.oldPath }
      : null;
  const diffQuery = useCommitFileDiff(repoPath, target);
  const showSkeleton = useSkeletonVisible(diffQuery.isPending && target !== null);

  if (!target) {
    return (
      <EmptyState
        icon={<FileSearch className="size-5" />}
        title={t("diff.nothingSelected.title")}
        description={t("history.selectFile")}
      />
    );
  }

  const header = <DiffHeader path={target.path} />;

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

  return (
    <>
      {header}
      <DiffViewer diff={diffQuery.data} />
    </>
  );
}
