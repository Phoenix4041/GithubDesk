import { call } from "@/shared/lib/tauri-client";

export interface GithubNotification {
  id: string;
  unread: boolean;
  reason: string;
  subject: { title: string; kind: string; url: string | null };
  repository: { fullName: string };
  updatedAt: string;
  webUrl: string | null;
}

export function listNotifications(accountId: string, all: boolean): Promise<GithubNotification[]> {
  return call<GithubNotification[]>("github_notifications_list", { accountId, all });
}

export function markNotificationRead(accountId: string, id: string): Promise<void> {
  return call<void>("github_notification_read", { accountId, id });
}

export function markAllNotificationsRead(accountId: string): Promise<void> {
  return call<void>("github_notifications_read_all", { accountId });
}
