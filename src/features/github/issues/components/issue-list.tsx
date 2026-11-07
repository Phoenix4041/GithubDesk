import { Plus, RefreshCw } from "lucide-react";
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
import { issueIcon } from "../../components/state-badge";
import type { GithubTarget } from "../../target";
import type { Issue } from "../../types";
import { useIssues, useLabels } from "../queries";
import { useIssueStore } from "../store";
import type { IssueFilter } from "../store";
import { CreateIssueDialog } from "./create-issue-dialog";

const ROW_HEIGHT = 64;
const FILTERS: IssueFilter[] = ["open", "closed", "all"];

interface IssueListProps {
  target: GithubTarget;
}

export function IssueList({ target }: IssueListProps) {
  const { t, i18n } = useTranslation();
  const filter = useIssueStore((state) => state.filter);
  const label = useIssueStore((state) => state.label);
  const search = useIssueStore((state) => state.search);
  const selected = useIssueStore((state) => state.selected);
  const setFilter = useIssueStore((state) => state.setFilter);
  const setLabel = useIssueStore((state) => state.setLabel);
  const setSearch = useIssueStore((state) => state.setSearch);
  const select = useIssueStore((state) => state.select);
  const debouncedSearch = useDebouncedValue(search, 350);
  const issues = useIssues(target, filter, label, debouncedSearch);
  const labels = useLabels(target);
  const showSkeleton = useSkeletonVisible(issues.isPending);
  const [creating, setCreating] = useState(false);

  const items = useMemo(() => issues.data?.pages.flatMap((page) => page.items) ?? [], [issues.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = issues;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function renderRow(issue: Issue) {
    const isSelected = issue.number === selected;
    return (
      <button
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => select(issue.number)}
        className={cn(
          "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-1 rounded-md px-2.5 text-left transition-colors duration-150",
          isSelected ? "bg-accent-soft" : "hover:bg-subtle",
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("shrink-0", issue.state === "open" ? "text-add" : "text-accent")}>
            {issueIcon(issue.state, issue.stateReason)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={issue.title}>
            {issue.title}
          </span>
        </span>
        <span className="flex items-center gap-1.5 overflow-hidden pl-[22px] text-[11px] text-muted">
          <span className="shrink-0">#{issue.number}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="truncate">{issue.user?.login ?? "-"}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="shrink-0">{formatRelativeTime(isoToUnixSeconds(issue.updatedAt), i18n.language)}</span>
          {issue.comments > 0 ? <span className="shrink-0">&middot; {t("github.issues.commentsCount", { count: issue.comments })}</span> : null}
        </span>
      </button>
    );
  }

  let content;
  if (showSkeleton) {
    content = <SkeletonRows count={8} rowHeight={ROW_HEIGHT} className="flex-1" />;
  } else if (issues.isPending) {
    content = <div className="flex-1" />;
  } else if (issues.isError) {
    const description = describeError(issues.error);
    content = <ErrorState title={description.title} message={description.message} onRetry={() => void issues.refetch()} />;
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={issueIcon("open", null, "size-5")}
        title={t("github.issues.empty.title")}
        description={debouncedSearch || label ? t("github.issues.empty.filtered") : t(`github.issues.empty.${filter}`)}
      />
    );
  } else {
    content = (
      <VirtualList
        items={items}
        rowHeight={ROW_HEIGHT}
        ariaLabel={t("github.issues.listLabel")}
        getKey={(issue) => issue.number}
        onNearEnd={loadMore}
        renderRow={renderRow}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label={t("github.issues.filterLabel")} className="flex min-w-0 flex-1 gap-1">
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
                {t(`github.issues.filters.${item}`)}
              </button>
            ))}
          </div>
          <IconButton label={t("github.refresh")} onClick={() => void issues.refetch()} disabled={issues.isFetching}>
            <RefreshCw className={cn("size-4", issues.isFetching && "animate-spin")} />
          </IconButton>
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
            {t("github.issues.new")}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <SearchInput label={t("github.issues.search")} value={search} onValueChange={setSearch} className="min-w-0 flex-1" />
          <select
            aria-label={t("github.issues.labelFilter")}
            value={label ?? ""}
            onChange={(event) => setLabel(event.target.value || null)}
            className="h-8 max-w-[40%] cursor-pointer rounded-md border border-line bg-surface px-2 text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
          >
            <option value="">{t("github.issues.allLabels")}</option>
            {(labels.data ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {content}
      <CreateIssueDialog open={creating} target={target} onClose={() => setCreating(false)} />
    </div>
  );
}
