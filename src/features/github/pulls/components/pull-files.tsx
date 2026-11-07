import { MessageSquareWarning } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChangeKindBadge } from "@/features/changes/components/change-badge";
import { DiffViewer } from "@/features/diff/components/diff-viewer";
import type { DiffSide, LineCommentControls } from "@/features/diff/line-comments";
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
import { addInlineComment, replyInThread } from "../actions";
import { usePullFiles, usePullReviewComments } from "../queries";
import { buildThreads, commentCounts, outdatedThreads, threadsAt, threadsForFile } from "../review-model";
import { usePullStore } from "../store";
import { ReviewThreadDialog } from "./review-thread-dialog";

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

type ThreadView = { kind: "line"; side: DiffSide; line: number } | { kind: "outdated" };

interface PullFilesProps {
  target: GithubTarget;
  number: number;
  headSha: string;
}

export function PullFiles({ target, number, headSha }: PullFilesProps) {
  const { t } = useTranslation();
  const files = usePullFiles(target, number, true);
  const reviewComments = usePullReviewComments(target, number, true);
  const [view, setView] = useState<ThreadView | null>(null);
  const selectedPath = usePullStore((state) => state.selectedFile);
  const selectFile = usePullStore((state) => state.selectFile);

  const items = useMemo(() => files.data?.pages.flatMap((page) => page.items) ?? [], [files.data]);
  const selected = items.find((file) => file.path === selectedPath) ?? items[0] ?? null;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = files;
  const reviewData = reviewComments.data;
  const threads = useMemo(() => buildThreads(reviewData ?? []), [reviewData]);
  const fileThreads = useMemo(() => (selected ? threadsForFile(threads, selected.path) : []), [threads, selected]);
  const outdated = useMemo(() => outdatedThreads(fileThreads), [fileThreads]);
  const openLine = useCallback((side: DiffSide, line: number) => setView({ kind: "line", side, line }), []);
  const lineComments = useMemo<LineCommentControls>(
    () => ({ counts: commentCounts(fileThreads), onOpen: openLine }),
    [fileThreads, openLine],
  );

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

  const viewedThreads =
    view?.kind === "line" ? threadsAt(fileThreads, view.side, view.line) : view?.kind === "outdated" ? outdated : [];
  const viewedPath = selected?.path ?? "";

  function closeView() {
    setView(null);
  }

  function dialogTitle(): string {
    if (view?.kind === "line") {
      return t(view.side === "LEFT" ? "github.pulls.inline.lineTitleOld" : "github.pulls.inline.lineTitle", { line: view.line });
    }
    return t("github.pulls.inline.outdatedTitle");
  }

  function dialogDescription(): string {
    return view?.kind === "outdated"
      ? t("github.pulls.inline.outdatedDescription", { path: viewedPath })
      : viewedPath;
  }

  const creator =
    view?.kind === "line"
      ? (body: string) =>
          addInlineComment(target, number, { body, path: viewedPath, line: view.line, side: view.side, commitId: headSha })
      : null;

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
            {outdated.length > 0 ? (
              <button
                type="button"
                onClick={() => setView({ kind: "outdated" })}
                className="flex cursor-pointer items-center gap-2 border-b border-line bg-subtle px-4 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-accent-soft"
              >
                <MessageSquareWarning className="size-3.5 shrink-0 text-muted" />
                {t("github.pulls.inline.outdatedBanner", { count: outdated.length })}
              </button>
            ) : null}
            <DiffViewer key={selected.path} diff={selected.diff} comments={lineComments} />
          </>
        ) : null}
      </div>
      <ReviewThreadDialog
        open={view !== null}
        title={dialogTitle()}
        description={dialogDescription()}
        threads={viewedThreads}
        onClose={closeView}
        onReply={(thread, body) => replyInThread(target, number, thread.id, body)}
        onCreate={creator}
      />
    </div>
  );
}
