import { Play, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { cn } from "@/shared/lib/cn";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { SearchInput } from "@/shared/ui/search-input";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { checkIcon } from "../../pulls/components/checks-list";
import type { GithubTarget } from "../../target";
import type { WorkflowRun } from "../../types";
import { useRuns } from "../queries";
import { runTitle } from "../run-model";
import { useRunStore } from "../store";
import { DispatchDialog } from "./dispatch-dialog";

const ROW_HEIGHT = 64;
const STATUS_FILTERS = ["all", "in_progress", "queued", "success", "failure", "cancelled"] as const;

interface RunListProps {
  target: GithubTarget;
}

export function RunList({ target }: RunListProps) {
  const { t, i18n } = useTranslation();
  const status = useRunStore((state) => state.status);
  const branch = useRunStore((state) => state.branch);
  const selected = useRunStore((state) => state.selected);
  const setStatus = useRunStore((state) => state.setStatus);
  const setBranch = useRunStore((state) => state.setBranch);
  const select = useRunStore((state) => state.select);
  const debouncedBranch = useDebouncedValue(branch, 350);
  const runs = useRuns(target, status, debouncedBranch);
  const showSkeleton = useSkeletonVisible(runs.isPending);
  const [dispatching, setDispatching] = useState(false);

  const items = useMemo(() => runs.data?.pages.flatMap((page) => page.items) ?? [], [runs.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = runs;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function renderRow(run: WorkflowRun) {
    const isSelected = run.id === selected;
    return (
      <button
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => select(run.id)}
        className={cn(
          "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-1 rounded-md px-2.5 text-left transition-colors duration-150",
          isSelected ? "bg-accent-soft" : "hover:bg-subtle",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="shrink-0">{checkIcon(run.status, run.conclusion)}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={runTitle(run)}>
            {runTitle(run)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 overflow-hidden pl-6 text-[11px] text-muted">
          <span className="shrink-0">
            {run.name ?? "-"} #{run.runNumber}
          </span>
          <span aria-hidden="true">&middot;</span>
          <span className="truncate">{run.headBranch ?? "-"}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="shrink-0">{formatRelativeTime(isoToUnixSeconds(run.createdAt), i18n.language)}</span>
        </span>
      </button>
    );
  }

  let content;
  if (showSkeleton) {
    content = <SkeletonRows count={8} rowHeight={ROW_HEIGHT} className="flex-1" />;
  } else if (runs.isPending) {
    content = <div className="flex-1" />;
  } else if (runs.isError) {
    const description = describeError(runs.error);
    content = <ErrorState title={description.title} message={description.message} onRetry={() => void runs.refetch()} />;
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={checkIcon("completed", "success", "size-5")}
        title={t("github.actions.empty.title")}
        description={status !== "all" || debouncedBranch ? t("github.actions.empty.filtered") : t("github.actions.empty.all")}
      />
    );
  } else {
    content = (
      <VirtualList
        items={items}
        rowHeight={ROW_HEIGHT}
        ariaLabel={t("github.actions.listLabel")}
        getKey={(run) => run.id}
        onNearEnd={loadMore}
        renderRow={renderRow}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5">
          <select
            aria-label={t("github.actions.statusFilter")}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-surface px-2 text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item} value={item}>
                {t(`github.actions.statuses.${item}`)}
              </option>
            ))}
          </select>
          <IconButton label={t("github.refresh")} onClick={() => void runs.refetch()} disabled={runs.isFetching}>
            <RefreshCw className={cn("size-4", runs.isFetching && "animate-spin")} />
          </IconButton>
          <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={() => setDispatching(true)}>
            {t("github.actions.run")}
          </Button>
        </div>
        <SearchInput label={t("github.actions.branchFilter")} value={branch} onValueChange={setBranch} />
      </div>
      {content}
      <DispatchDialog open={dispatching} target={target} onClose={() => setDispatching(false)} />
    </div>
  );
}
