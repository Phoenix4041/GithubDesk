import { GitPullRequestCreate, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { StateBadge, pullIcon, pullTone } from "../../components/state-badge";
import type { GithubTarget } from "../../target";
import type { PullRequest } from "../../types";
import { pullState } from "../pull-model";
import { usePulls } from "../queries";
import { usePullStore } from "../store";
import type { PullFilter } from "../store";
import { CreatePullDialog } from "./create-pull-dialog";

const ROW_HEIGHT = 64;
const FILTERS: PullFilter[] = ["open", "closed", "all"];

interface PullListProps {
  repoPath: string;
  target: GithubTarget;
}

export function PullList({ repoPath, target }: PullListProps) {
  const { t, i18n } = useTranslation();
  const filter = usePullStore((state) => state.filter);
  const selected = usePullStore((state) => state.selected);
  const setFilter = usePullStore((state) => state.setFilter);
  const select = usePullStore((state) => state.select);
  const pulls = usePulls(target, filter);
  const showSkeleton = useSkeletonVisible(pulls.isPending);
  const [creating, setCreating] = useState(false);

  const items = useMemo(() => pulls.data?.pages.flatMap((page) => page.items) ?? [], [pulls.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pulls;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function renderRow(pull: PullRequest) {
    const state = pullState(pull);
    const isSelected = pull.number === selected;
    return (
      <button
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => select(pull.number)}
        className={cn(
          "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-1 rounded-md px-2.5 text-left transition-colors duration-150",
          isSelected ? "bg-accent-soft" : "hover:bg-subtle",
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("shrink-0", state === "open" ? "text-add" : state === "merged" ? "text-accent" : state === "closed" ? "text-del" : "text-muted")}>
            {pullIcon(state)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={pull.title}>
            {pull.title}
          </span>
        </span>
        <span className="flex items-center gap-1.5 overflow-hidden pl-[22px] text-[11px] text-muted">
          <span className="shrink-0">#{pull.number}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="truncate">{pull.user?.login ?? "-"}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="shrink-0">{formatRelativeTime(isoToUnixSeconds(pull.updatedAt), i18n.language)}</span>
          {state === "draft" ? <StateBadge tone="muted" label={t("github.pulls.state.draft")} className="ml-1 py-0" /> : null}
        </span>
      </button>
    );
  }

  let content;
  if (showSkeleton) {
    content = <SkeletonRows count={8} rowHeight={ROW_HEIGHT} className="flex-1" />;
  } else if (pulls.isPending) {
    content = <div className="flex-1" />;
  } else if (pulls.isError) {
    const description = describeError(pulls.error);
    content = <ErrorState title={description.title} message={description.message} onRetry={() => void pulls.refetch()} />;
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={pullIcon("open", "size-5")}
        title={t("github.pulls.empty.title")}
        description={t(`github.pulls.empty.${filter}`)}
      />
    );
  } else {
    content = (
      <VirtualList
        items={items}
        rowHeight={ROW_HEIGHT}
        ariaLabel={t("github.pulls.listLabel")}
        getKey={(pull) => pull.number}
        onNearEnd={loadMore}
        renderRow={renderRow}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <div role="group" aria-label={t("github.pulls.filterLabel")} className="flex min-w-0 flex-1 gap-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={cn(
                "h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
                filter === item ? "bg-subtle text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t(`github.pulls.filters.${item}`)}
            </button>
          ))}
        </div>
        <IconButton label={t("github.refresh")} onClick={() => void pulls.refetch()} disabled={pulls.isFetching}>
          <RefreshCw className={cn("size-4", pulls.isFetching && "animate-spin")} />
        </IconButton>
        <Button size="sm" variant="primary" icon={<GitPullRequestCreate className="size-3.5" />} onClick={() => setCreating(true)}>
          {t("github.pulls.new")}
        </Button>
      </div>
      {content}
      <CreatePullDialog open={creating} repoPath={repoPath} target={target} onClose={() => setCreating(false)} />
    </div>
  );
}

export { pullTone };
