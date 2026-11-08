import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { IconButton } from "@/shared/ui/icon-button";
import { badgeText, unreadCount } from "../notification-model";
import { useUnreadNotifications } from "../queries";
import { useNotificationDialogStore } from "../store";
import { useNotificationAccount } from "../use-notification-alerts";

export function NotificationsButton() {
  const { t } = useTranslation();
  const accountId = useNotificationAccount();
  const enabled = useSettingsStore((state) => state.notificationsEnabled);
  const unread = useUnreadNotifications(accountId, enabled);
  const show = useNotificationDialogStore((state) => state.show);

  if (accountId === null) {
    return null;
  }
  const count = unreadCount(unread.data);
  return (
    <div className="relative">
      <IconButton label={count > 0 ? t("github.notifications.buttonUnread", { count }) : t("github.notifications.button")} onClick={show}>
        <Bell className="size-4" />
      </IconButton>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] leading-4 font-semibold text-accent-fg"
        >
          {badgeText(count)}
        </span>
      ) : null}
    </div>
  );
}
