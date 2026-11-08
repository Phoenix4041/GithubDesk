import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { i18next } from "@/i18n";
import { getStatus } from "@/features/changes/api";
import { useUnreadNotifications } from "@/features/github/notifications/queries";
import { useNotificationAccount } from "@/features/github/notifications/use-notification-alerts";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import { repoKeys } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { setTrayEnabled, setTrayPending } from "./api";
import { pendingCount } from "./background-model";

export function trayTooltip(count: number): string {
  return count > 0 ? i18next.t("background.tray.tooltipPending", { count }) : i18next.t("background.tray.tooltip");
}

function useTrayPendingCount(enabled: boolean): number {
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);
  const activePath = useRepositoriesStore((state) => state.activePath);
  const accountId = useNotificationAccount();
  const unread = useUnreadNotifications(accountId, enabled && notificationsEnabled);
  const status = useQuery({
    queryKey: repoKeys.status(activePath ?? ""),
    queryFn: () => getStatus(activePath ?? ""),
    enabled: false,
  });
  return pendingCount(unread.data?.length ?? 0, activePath ? (status.data?.branch.behind ?? 0) : 0);
}

export function useTray(): void {
  const { t, i18n } = useTranslation();
  const enabled = useSettingsStore((state) => state.trayEnabled);
  const count = useTrayPendingCount(enabled);
  const tooltip = trayTooltip(count);
  const latestTooltip = useRef(tooltip);

  useEffect(() => {
    latestTooltip.current = tooltip;
  }, [tooltip]);

  useEffect(() => {
    if (!enabled) {
      void setTrayEnabled(false, null).catch(() => undefined);
      return;
    }
    const labels = {
      open: t("background.tray.open"),
      fetch: t("background.tray.fetch"),
      quit: t("background.tray.quit"),
      tooltip: latestTooltip.current,
    };
    void setTrayEnabled(true, labels).catch((error: unknown) => {
      useSettingsStore.getState().setTrayEnabled(false);
      reportError(error);
    });
  }, [enabled, t, i18n.language]);

  useEffect(() => {
    if (enabled) {
      void setTrayPending(count, tooltip).catch(() => undefined);
    }
  }, [enabled, count, tooltip]);
}
