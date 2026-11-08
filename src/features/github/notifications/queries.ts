import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "./api";
import { pollMilliseconds } from "./notification-model";

export const notificationKeys = {
  all: ["github", "notifications"] as const,
  unread: (accountId: string) => ["github", "notifications", accountId, "unread"] as const,
};

export function useUnreadNotifications(accountId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.unread(accountId ?? ""),
    queryFn: () => listNotifications(accountId ?? "", false),
    enabled: enabled && accountId !== null,
    refetchInterval: pollMilliseconds(null),
    refetchIntervalInBackground: true,
    staleTime: 30_000,
    retry: false,
  });
}
