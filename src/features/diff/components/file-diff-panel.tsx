import type { UseQueryResult } from "@tanstack/react-query";
import { isImagePath } from "@/features/browse/image-path";
import { FileSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import type { FileDiff } from "@/shared/types/git";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { DiffHeader } from "./diff-header";
import { DiffViewer } from "./diff-viewer";
import { ImageDiffSection } from "./image-diff-section";
import type { ImageSides } from "./image-diff-section";

interface FileDiffPanelProps {
  target: { path: string } | null;
  query: UseQueryResult<FileDiff>;
  placeholder: string;
  images?: { repoPath: string; sides: ImageSides } | null;
}

export function FileDiffPanel({ target, query, placeholder, images }: FileDiffPanelProps) {
  const { t } = useTranslation();
  const showSkeleton = useSkeletonVisible(query.isPending && target !== null);

  if (!target) {
    return (
      <EmptyState
        icon={<FileSearch className="size-5" />}
        title={t("diff.nothingSelected.title")}
        description={placeholder}
      />
    );
  }

  const header = <DiffHeader path={target.path} />;

  if (images && isImagePath(target.path)) {
    return (
      <>
        {header}
        <ImageDiffSection key={target.path} repoPath={images.repoPath} sides={images.sides} />
      </>
    );
  }
  if (showSkeleton) {
    return (
      <>
        {header}
        <SkeletonRows count={14} rowHeight={20} />
      </>
    );
  }
  if (query.isPending) {
    return header;
  }
  if (query.isError) {
    const description = describeError(query.error);
    return (
      <>
        {header}
        <ErrorState title={description.title} message={description.message} onRetry={() => void query.refetch()} />
      </>
    );
  }

  return (
    <>
      {header}
      <DiffViewer diff={query.data} />
    </>
  );
}
