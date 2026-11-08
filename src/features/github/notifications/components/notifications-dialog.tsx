import { Bell, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { openExternal } from "@/shared/lib/external";
import { formatRelativeTime } from "@/shared/lib/format";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { QueryError } from "../../settings/components/section-frame";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api";
import type { GithubNotification } from "../api";
import { notificationKeys } from "../queries";
import { useNotificationAccount } from "../use-notification-alerts";
import { useNotificationDialogStore } from "../store";

async function refresh(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

function Row({ accountId, item }: { accountId: string; item: GithubNotification }) {
  const { t, i18n } = useTranslation();
  const updated = isoToUnixSeconds(item.updatedAt);

  async function open() {
    try {
      if (item.webUrl) {
        await openExternal(item.webUrl);
      }
      if (item.unread) {
        await markNotificationRead(accountId, item.id);
        await refresh();
      }
    } catch (error) {
      reportError(error);
    }
  }

  return (
    <li>
      <button type="button" onClick={() => void open()} className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left hover:bg-subtle">
        <span aria-hidden="true" className={item.unread ? "mt-1.5 size-2 shrink-0 rounded-full bg-accent" : "mt-1.5 size-2 shrink-0"} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px]">{item.subject.title}</span>
          <span className="truncate text-[11px] text-muted">
            {item.repository.fullName} · {t(`github.notifications.reasons.${reasonKey(item.reason)}`)}
            {updated > 0 ? ` · ${formatRelativeTime(updated, i18n.language)}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

const KNOWN_REASONS = ["assign", "author", "comment", "mention", "review_requested", "subscribed", "team_mention", "state_change", "ci_activity"] as const;
type KnownReason = (typeof KNOWN_REASONS)[number];

function reasonKey(reason: string): KnownReason | "other" {
  return (KNOWN_REASONS as readonly string[]).includes(reason) ? (reason as KnownReason) : "other";
}

function Body({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: [...notificationKeys.all, accountId, "all"],
    queryFn: () => listNotifications(accountId, true),
    retry: false,
  });

  async function readAll() {
    try {
      await markAllNotificationsRead(accountId);
      await refresh();
    } catch (error) {
      reportError(error);
    }
  }

  if (list.isPending) {
    return <Skeleton className="h-32" />;
  }
  if (list.isError) {
    return <QueryError error={list.error} onRetry={() => void list.refetch()} />;
  }
  if (list.data.length === 0) {
    return <EmptyState icon={<Bell className="size-5" />} title={t("github.notifications.empty")} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button size="sm" icon={<CheckCheck className="size-3.5" />} onClick={() => void readAll()}>
          {t("github.notifications.readAll")}
        </Button>
      </div>
      <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line" aria-label={t("github.notifications.title")}>
        {list.data.map((item) => (
          <Row key={item.id} accountId={accountId} item={item} />
        ))}
      </ul>
    </div>
  );
}

export function NotificationsDialog() {
  const { t } = useTranslation();
  const open = useNotificationDialogStore((state) => state.open);
  const hide = useNotificationDialogStore((state) => state.hide);
  const accountId = useNotificationAccount();
  if (!open) {
    return null;
  }
  return (
    <Dialog
      open
      title={t("github.notifications.title")}
      description={t("github.notifications.description")}
      onClose={hide}
      width="lg"
      footer={<Button onClick={hide}>{t("common.close")}</Button>}
    >
      {accountId ? <Body key={accountId} accountId={accountId} /> : <p className="text-xs text-muted">{t("github.accounts.empty")}</p>}
    </Dialog>
  );
}
