import { GitCommitHorizontal, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { CommitSummary } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { openContextMenu } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { buildCommitMenu } from "../commit-menu";
import { selectFilterFields, useHistoryFilterStore } from "../filter-store";
import { computeGraph, graphLaneCount } from "../graph-model";
import { buildHistoryQuery, isFiltering } from "../history-query";
import { useCommitFiles, useGraphPreparation, useHistory } from "../queries";
import { useHistoryStore } from "../store";
import { CommitDetails } from "./commit-details";
import { CommitRow } from "./commit-row";
import { GRAPH_LANE_WIDTH, GRAPH_MAX_LANES } from "./graph-cell";
import { HistoryToolbar } from "./history-toolbar";

const COMMIT_ROW_HEIGHT = 54;
const SEARCH_DEBOUNCE_MILLISECONDS = 300;

interface HistoryViewProps {
  repoPath: string;
}

export function HistoryView({ repoPath }: HistoryViewProps) {
  const { t } = useTranslation();
  const filterFields = useHistoryFilterStore(useShallow(selectFilterFields));
  const graphWanted = useHistoryFilterStore((state) => state.graph);
  const clearFilters = useHistoryFilterStore((state) => state.clear);
  const debouncedFields = useDebouncedValue(filterFields, SEARCH_DEBOUNCE_MILLISECONDS);
  const query = useMemo(() => buildHistoryQuery(debouncedFields, graphWanted), [debouncedFields, graphWanted]);
  const drawGraph = query.topoOrder;
  const graphPreparation = useGraphPreparation(repoPath, drawGraph);
  const history = useHistory(repoPath, query, !drawGraph || !graphPreparation.isPending);

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
  const graphRows = useMemo(() => (drawGraph ? computeGraph(commits).rows : null), [drawGraph, commits]);
  const graphWidth = graphRows ? Math.min(graphLaneCount(graphRows), GRAPH_MAX_LANES) * GRAPH_LANE_WIDTH + 10 : 0;
  const filtering = isFiltering(debouncedFields);

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

  let content;
  if (showSkeleton) {
    content = <SkeletonRows count={10} rowHeight={COMMIT_ROW_HEIGHT} className="flex-1" />;
  } else if (history.isPending) {
    content = <div className="flex-1" />;
  } else if (history.isError) {
    const description = describeError(history.error);
    content = (
      <ErrorState title={description.title} message={description.message} onRetry={() => void history.refetch()} />
    );
  } else if (commits.length === 0 && filtering) {
    content = (
      <EmptyState
        icon={<SearchX className="size-5" />}
        title={t("history.search.noResults.title")}
        description={t("history.search.noResults.description")}
        action={
          <Button size="sm" onClick={clearFilters}>
            {t("history.search.clear")}
          </Button>
        }
      />
    );
  } else if (commits.length === 0) {
    content = (
      <EmptyState
        icon={<GitCommitHorizontal className="size-5" />}
        title={t("history.empty.title")}
        description={t("history.empty.description")}
      />
    );
  } else {
    content = (
      <>
        <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity duration-150", history.isPlaceholderData && "opacity-60")}>
          <VirtualList
            items={commits}
            rowHeight={COMMIT_ROW_HEIGHT}
            ariaLabel={t("history.listLabel")}
            getKey={(commit) => commit.hash}
            onNearEnd={loadMore}
            renderRow={(commit, index) => (
              <CommitRow
                commit={commit}
                selected={selectedSet.has(commit.hash)}
                graph={graphRows?.[index] ?? null}
                graphWidth={graphWidth}
                height={COMMIT_ROW_HEIGHT}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
              />
            )}
          />
        </div>
        {selectedHash ? (
          <div className="flex h-[40%] min-h-[180px] flex-col border-t border-line bg-surface">
            <CommitDetails key={selectedHash} repoPath={repoPath} hash={selectedHash} />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HistoryToolbar fields={filterFields} />
      {content}
    </div>
  );
}
