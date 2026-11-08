import { CircleDot, GitPullRequest, GitPullRequestDraft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openExternal } from "@/shared/lib/external";
import { formatRelativeTime } from "@/shared/lib/format";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { describeError } from "@/shared/lib/report-error";
import type { GithubAccount } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import type { InboxItem } from "../api";
import { useInbox } from "../queries";

interface InboxPanelProps {
  account: GithubAccount;
  org: string | null;
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

function Group({ title, items }: { title: string; items: InboxItem[] }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <h3 className="px-3 pt-2 text-xs font-semibold">
        {title} <span className="font-normal text-muted">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-muted">{t("github.home.inboxEmpty")}</p>
      ) : (
        <ul className="divide-y divide-line">
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
      )}
    </section>
  );
}

export function InboxPanel({ account, org }: InboxPanelProps) {
  const { t } = useTranslation();
  const inbox = useInbox(account.id, org);

  if (inbox.isPending) {
    return <Skeleton className="h-28" />;
  }
  if (inbox.isError) {
    const description = describeError(inbox.error);
    return (
      <div className="flex flex-col items-start gap-2 text-xs" role="alert">
        <p className="font-medium text-danger">{description.title}</p>
        <p className="text-muted">{description.message}</p>
        <Button size="sm" onClick={() => void inbox.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-line bg-surface">
      <Group title={t("github.home.reviewRequested")} items={inbox.data.reviewRequested} />
      <Group title={t("github.home.assigned")} items={inbox.data.assigned} />
      <Group title={t("github.home.authored")} items={inbox.data.authored} />
    </div>
  );
}
