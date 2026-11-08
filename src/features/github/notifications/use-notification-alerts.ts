import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useEffect, useRef } from "react";
import { i18next } from "@/i18n";
import { homeContext } from "../home/home-model";
import { useAccounts } from "../queries";
import { useSettingsStore } from "@/features/settings/store";
import { newNotifications, summarize } from "./notification-model";
import { useUnreadNotifications } from "./queries";

async function showDesktopNotification(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    return;
  }
}

export function useNotificationAccount(): string | null {
  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);
  return homeContext(profiles, activeProfileId, accounts.data ?? []).account?.id ?? null;
}

export function useNotificationAlerts(): void {
  const enabled = useSettingsStore((state) => state.notificationsEnabled);
  const accountId = useNotificationAccount();
  const unread = useUnreadNotifications(accountId, enabled);
  const seen = useRef<{ accountId: string | null; ids: Set<string> } | null>(null);
  const items = unread.data;

  useEffect(() => {
    if (!enabled || !items) {
      return;
    }
    const known = seen.current;
    if (!known || known.accountId !== accountId) {
      seen.current = { accountId, ids: new Set(items.map((item) => item.id)) };
      return;
    }
    const fresh = newNotifications(items, known.ids);
    for (const item of items) {
      known.ids.add(item.id);
    }
    if (fresh.length > 0) {
      void showDesktopNotification(i18next.t("github.notifications.desktopTitle", { count: fresh.length }), summarize(fresh));
    }
  }, [enabled, items, accountId]);
}
