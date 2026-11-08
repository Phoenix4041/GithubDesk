import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import type { GithubAccount } from "@/shared/types/git";
import type { GithubNotification } from "./api";
import { notificationKeys } from "./queries";
import { useNotificationAlerts } from "./use-notification-alerts";

const plugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => plugin);

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

function item(id: string, unread = true): GithubNotification {
  return {
    id,
    unread,
    reason: "mention",
    subject: { title: `Subject ${id}`, kind: "PullRequest", url: null },
    repository: { fullName: "acme/app" },
    updatedAt: "2026-02-01T10:00:00Z",
    webUrl: null,
  };
}

function Probe() {
  useNotificationAlerts();
  return null;
}

function setup(responses: GithubNotification[][]) {
  let index = 0;
  mockIPC((command) => {
    if (command === "github_accounts_list") {
      return [ACCOUNT];
    }
    if (command === "github_notifications_list") {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    }
    return null;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  return client;
}

describe("useNotificationAlerts", () => {
  beforeEach(() => {
    plugin.isPermissionGranted.mockReset().mockResolvedValue(true);
    plugin.requestPermission.mockReset().mockResolvedValue("granted");
    plugin.sendNotification.mockReset();
    useSettingsStore.setState({ profiles: [], activeProfileId: null, notificationsEnabled: true });
  });

  afterEach(() => {
    useSettingsStore.setState({ notificationsEnabled: false });
  });

  it("does not alert for what was already there and alerts only for new unread items", async () => {
    const client = setup([[item("1")], [item("1"), item("2"), item("3", false)]]);
    await waitFor(() => expect(client.getQueryData(notificationKeys.unread(ACCOUNT.id))).toBeTruthy());
    expect(plugin.sendNotification).not.toHaveBeenCalled();

    await act(async () => {
      await client.invalidateQueries({ queryKey: notificationKeys.all });
    });
    await waitFor(() => expect(plugin.sendNotification).toHaveBeenCalledTimes(1));
    const sent = plugin.sendNotification.mock.calls[0]?.[0] as { title: string; body: string };
    expect(sent.body).toContain("Subject 2");
    expect(sent.body).not.toContain("Subject 1");
    expect(sent.body).not.toContain("Subject 3");
  });

  it("asks for the system permission once and stays quiet when it is refused", async () => {
    plugin.isPermissionGranted.mockResolvedValue(false);
    plugin.requestPermission.mockResolvedValue("denied");
    const client = setup([[item("1")], [item("1"), item("2")]]);
    await waitFor(() => expect(client.getQueryData(notificationKeys.unread(ACCOUNT.id))).toBeTruthy());
    await act(async () => {
      await client.invalidateQueries({ queryKey: notificationKeys.all });
    });
    await waitFor(() => expect(plugin.requestPermission).toHaveBeenCalledTimes(1));
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing while the setting is off", async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    const client = setup([[item("1")]]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(client.getQueryData(notificationKeys.unread(ACCOUNT.id))).toBeUndefined();
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });
});
