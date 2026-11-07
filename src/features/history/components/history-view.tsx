import { GitCommitHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import type { CommitSummary } from "@/shared/types/git";
import { openContextMenu } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { buildCommitMenu } from "../commit-menu";
import { useCommitFiles, useHistory } from "../queries";
import { useHistoryStore } from "../store";
import { CommitDetails } from "./commit-details";
import { CommitRow } from "./commit-row";

const COMMIT_ROW_HEIGHT = 54;

interface HistoryViewProps {
  repoPath: string;
}

export function HistoryView({ repoPath }: HistoryViewProps) {
  const { t } = useTranslation();
  const history = useHistory(repoPath);
  const selectedHash = useHistoryStore((state) => state.selectedHash);
  const selectedHashes = useHistoryStore((state) => state.selectedHashes);
  const selectedFile = useHistoryStore((state) => state.selectedFile);
  const selectCommit = useHistoryStore((state) => state.selectCommit);
  const toggleCommit = useHistoryStore((state) => state.toggleCommit);
  const selectRange = useHistoryStore((state) => state.selectRange);
  const selectFile = useHistoryStore((state) => state.selectFile);
  const files = useCommitFiles(repoPath, selectedHash);
  const showSkeleton = useSkeletonVisible(history.isPending);

  const commits = useMemo(() => history.data?.pages.flat() ?? [], [history.data]);
  const selectedSet = useMemo(() => new Set(selectedHashes), [selectedHashes]);

  const handleSelect = useCallback(
    (commit: CommitSummary, event: ReactMouseEvent) => {
      if (event.shiftKey) {
        selectRange(
          commit.hash,
          commits.map((candidate) => candidate.hash),
        );
      } else if (event.ctrlKey || event.metaKey) {
        toggleCommit(commit.hash);
      } else {
        selectCommit(commit.hash);
      }
    },
    [commits, selectCommit, selectRange, toggleCommit],
  );

  const handleContextMenu = useCallback(
    (commit: CommitSummary, event: ReactMouseEvent) => {
      if (!useHistoryStore.getState().selectedHashes.includes(commit.hash)) {
        selectCommit(commit.hash);
      }
      const chosen = new Set(useHistoryStore.getState().selectedHashes);
      const selectedNewestFirst = commits.filter((candidate) => chosen.has(candidate.hash));
      openContextMenu(event, buildCommitMenu({ repoPath, commit, selectedNewestFirst }));
    },
    [commits, repoPath, selectCommit],
  );

  useEffect(() => {
    if (commits.length === 0) {
      return;
    }
    if (!selectedHash) {
      selectCommit(commits[0]?.hash ?? null);
    }
  }, [commits, selectedHash, selectCommit]);

  useEffect(() => {
    if (!selectedFile && files.data && files.data.length > 0) {
      const first = files.data[0];
      if (first) {
        selectFile({ path: first.path, oldPath: first.oldPath });
      }
    }
  }, [files.data, selectedFile, selectFile]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (showSkeleton) {
    return <SkeletonRows count={10} rowHeight={54} className="flex-1" />;
  }
  if (history.isPending) {
    return <div className="flex-1" />;
  }
  if (history.isError) {
    const description = describeError(history.error);
    return (
      <ErrorState title={description.title} message={description.message} onRetry={() => void history.refetch()} />
    );
  }
  if (commits.length === 0) {
    return (
      <EmptyState
        icon={<GitCommitHorizontal className="size-5" />}
        title={t("history.empty.title")}
        description={t("history.empty.description")}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        items={commits}
        rowHeight={COMMIT_ROW_HEIGHT}
        ariaLabel={t("history.listLabel")}
        getKey={(commit) => commit.hash}
        onNearEnd={loadMore}
        renderRow={(commit) => (
          <CommitRow
            commit={commit}
            selected={selectedSet.has(commit.hash)}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
          />
        )}
      />
      {selectedHash ? (
        <div className="flex h-[40%] min-h-[180px] flex-col border-t border-line bg-surface">
          <CommitDetails key={selectedHash} repoPath={repoPath} hash={selectedHash} />
        </div>
      ) : null}
    </div>
  );
}
