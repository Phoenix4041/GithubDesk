import { AlertCircle, CircleDot, GitBranch, GitPullRequest, GitPullRequestDraft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { InboxItem } from "@/features/github/home/api";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { openExternal } from "@/shared/lib/external";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import type { RecentRepoRow } from "../home-model";

interface BlockShellProps {
  title: string;
  count?: number;
  children: ReactNode;
}

export function BlockShell({ title, count, children }: BlockShellProps) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title}>
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
        {count !== undefined && count > 0 ? <span className="ml-1.5 font-normal normal-case">({count})</span> : null}
      </h2>
      <div className="flex min-h-[120px] flex-col overflow-hidden rounded-xl border border-line bg-surface">{children}</div>
    </section>
  );
}

export function BlockLoading() {
  return (
    <div className="flex flex-col gap-2 p-3" role="status" aria-busy="true">
      <Skeleton className="h-4" width="70%" />
      <Skeleton className="h-4" width="55%" />
      <Skeleton className="h-4" width="80%" />
    </div>
  );
}

export function BlockError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const description = describeError(error);
  return (
    <div className="flex flex-col items-start gap-2 p-3 text-xs" role="alert">
      <p className="flex items-center gap-1.5 font-medium text-danger">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        {description.title}
      </p>
      <p className="text-muted">{description.message}</p>
      <Button size="sm" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

export function BlockEmpty({ message }: { message: string }) {
  return <p className="flex flex-1 items-center justify-center px-4 py-6 text-center text-xs text-muted">{message}</p>;
}

function ItemIcon({ item }: { item: InboxItem }) {
  if (!item.pullRequest) {
    return <CircleDot className="size-4 shrink-0 text-add" aria-hidden="true" />;
  }
  return item.draft ? (
    <GitPullRequestDraft className="size-4 shrink-0 text-muted" aria-hidden="true" />
  ) : (
    <GitPullRequest className="size-4 shrink-0 text-add" aria-hidden="true" />
  );
}

export function ItemList({ items }: { items: InboxItem[] }) {
  const { i18n } = useTranslation();
  return (
    <ul className="max-h-64 divide-y divide-line overflow-y-auto">
      {items.map((item) => {
        const updated = isoToUnixSeconds(item.updatedAt);
        return (
          <li key={item.htmlUrl}>
            <button
              type="button"
              onClick={() => void openExternal(item.htmlUrl)}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-subtle"
            >
              <ItemIcon item={item} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px]">{item.title}</span>
                <span className="truncate text-[11px] text-muted">
                  {item.repository}#{item.number}
                  {item.author ? ` · ${item.author}` : ""}
                  {updated > 0 ? ` · ${formatRelativeTime(updated, i18n.language)}` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface ItemBlockProps {
  title: string;
  emptyMessage: string;
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  items: InboxItem[] | undefined;
}

export function ItemBlock({ title, emptyMessage, query, items }: ItemBlockProps) {
  let body: ReactNode;
  if (query.isPending) {
    body = <BlockLoading />;
  } else if (query.isError) {
    body = <BlockError error={query.error} onRetry={() => void query.refetch()} />;
  } else if (!items || items.length === 0) {
    body = <BlockEmpty message={emptyMessage} />;
  } else {
    body = <ItemList items={items} />;
  }
  return (
    <BlockShell title={title} count={items?.length}>
      {body}
    </BlockShell>
  );
}

export function RepoStatusLabel({ row }: { row: RecentRepoRow }) {
  const { t } = useTranslation();
  const text = t(`dashboard.status.${row.status}`, { ahead: row.ahead, behind: row.behind, count: row.ahead || row.behind });
  const tone = row.status === "clean" ? "text-muted" : row.status === "missing" ? "text-danger" : "text-accent";
  return <span className={`shrink-0 text-[11px] ${tone}`}>{text}</span>;
}

interface RecentListProps {
  rows: RecentRepoRow[];
  onOpen: (row: RecentRepoRow) => void;
}

export function RecentList({ rows, onOpen }: RecentListProps) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.path}>
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-subtle"
          >
            <GitBranch className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{row.name}</span>
              <span className="truncate text-[11px] text-muted">
                {row.branch ?? t("dashboard.recents.noBranch")} ·{" "}
                {formatRelativeTime(Math.floor(row.lastOpened / 1000), i18n.language)}
              </span>
            </span>
            <RepoStatusLabel row={row} />
          </button>
        </li>
      ))}
    </ul>
  );
}
