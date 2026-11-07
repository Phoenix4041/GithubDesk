import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChangeKindBadge } from "@/features/changes/components/change-badge";
import { DiffViewer } from "@/features/diff/components/diff-viewer";
import { cn } from "@/shared/lib/cn";
import { splitPath } from "@/shared/lib/paths";
import { describeError } from "@/shared/lib/report-error";
import type { ChangeKind } from "@/shared/types/git";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { DiffOptions } from "@/features/diff/components/diff-options";
import type { GithubTarget } from "../../target";
import { usePullFiles } from "../queries";
import { usePullStore } from "../store";

const ROW_HEIGHT = 34;

function kindOf(status: string): ChangeKind {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

interface PullFilesProps {
  target: GithubTarget;
  number: number;
}

export function PullFiles({ target, number }: PullFilesProps) {
  const { t } = useTranslation();
  const files = usePullFiles(target, number, true);
  const selectedPath = usePullStore((state) => state.selectedFile);
  const selectFile = usePullStore((state) => state.selectFile);

  const items = useMemo(() => files.data?.pages.flatMap((page) => page.items) ?? [], [files.data]);
  const selected = items.find((file) => file.path === selectedPath) ?? items[0] ?? null;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = files;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (files.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  if (files.isError) {
    const description = describeError(files.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void files.refetch()} />;
  }
  if (items.length === 0) {
    return <EmptyState icon={null} title={t("github.pulls.files.empty")} />;
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-line">
        <VirtualList
          items={items}
          rowHeight={ROW_HEIGHT}
          ariaLabel={t("github.pulls.files.listLabel")}
          getKey={(file) => file.path}
          renderRow={(file) => {
            const { directory, fileName } = splitPath(file.path);
            const isSelected = selected?.path === file.path;
            return (
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                onClick={() => selectFile(file.path)}
                title={file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path}
                className={cn(
                  "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors duration-150",
                  isSelected ? "bg-accent-soft" : "hover:bg-subtle",
                )}
              >
                <ChangeKindBadge kind={kindOf(file.status)} label={t(`changes.kind.${kindOf(file.status)}`)} />
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0 text-[13px] font-medium">{fileName}</span>
                  <span className="truncate text-[11px] text-muted">{directory}</span>
                </span>
                <span className="shrink-0 text-[10px] tabular-nums">
                  <span className="text-add">+{file.additions}</span> <span className="text-del">-{file.deletions}</span>
                </span>
              </button>
            );
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={selected.path}>
                {selected.path}
              </span>
              <DiffOptions hideWhitespace />
            </div>
            <DiffViewer key={selected.path} diff={selected.diff} />
          </>
        ) : null}
      </div>
    </div>
  );
}
