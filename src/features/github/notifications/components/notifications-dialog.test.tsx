import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import type { GithubAccount } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import type { GithubNotification } from "../api";
import { useNotificationDialogStore } from "../store";
import { NotificationsButton } from "./notifications-button";
import { NotificationsDialog } from "./notifications-dialog";

const opener = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/external", () => ({ openExternal: opener }));

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

function item(id: string, unread: boolean, webUrl: string | null = `https://github.com/acme/app/pull/${id}`): GithubNotification {
  return {
    id,
    unread,
    reason: "review_requested",
    subject: { title: `Subject ${id}`, kind: "PullRequest", url: null },
    repository: { fullName: "acme/app" },
    updatedAt: "2026-02-01T10:00:00Z",
    webUrl,
  };
}

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(list: GithubNotification[], accounts: GithubAccount[] = [ACCOUNT]): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "github_accounts_list") {
      return accounts;
    }
    if (command === "github_notifications_list") {
      return list;
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("NotificationsDialog", () => {
  beforeEach(() => {
    opener.mockReset();
    useSettingsStore.setState({ profiles: [], activeProfileId: null, notificationsEnabled: true });
  });

  afterEach(() => {
    act(() => useNotificationDialogStore.getState().hide());
    useSettingsStore.setState({ notificationsEnabled: false });
  });

  it("opens an unread notification on GitHub and marks it as read", async () => {
    const calls = serve([item("11", true), item("12", false)]);
    renderWithProviders(<NotificationsDialog />);
    act(() => useNotificationDialogStore.getState().show());

    fireEvent.click(await screen.findByRole("button", { name: /Subject 11/ }));
    await waitFor(() => expect(opener).toHaveBeenCalledWith("https://github.com/acme/app/pull/11"));
    await waitFor(() => expect(calls.github_notification_read?.[0]).toMatchObject({ accountId: ACCOUNT.id, id: "11" }));

    fireEvent.click(screen.getByRole("button", { name: /Subject 12/ }));
    await waitFor(() => expect(opener).toHaveBeenCalledTimes(2));
    expect(calls.github_notification_read?.length).toBe(1);
  });

  it("marks everything as read", async () => {
    const calls = serve([item("11", true)]);
    renderWithProviders(<NotificationsDialog />);
    act(() => useNotificationDialogStore.getState().show());
    fireEvent.click(await screen.findByRole("button", { name: t("github.notifications.readAll") }));
    await waitFor(() => expect(calls.github_notifications_read_all?.[0]).toMatchObject({ accountId: ACCOUNT.id }));
  });

  it("shows an empty state", async () => {
    serve([]);
    renderWithProviders(<NotificationsDialog />);
    act(() => useNotificationDialogStore.getState().show());
    expect(await screen.findByText(t("github.notifications.empty"))).toBeTruthy();
  });
});

describe("NotificationsButton", () => {
  beforeEach(() => {
    useSettingsStore.setState({ profiles: [], activeProfileId: null, notificationsEnabled: true });
  });

  afterEach(() => {
    useSettingsStore.setState({ notificationsEnabled: false });
  });

  it("shows the unread count and opens the dialog", async () => {
    serve([item("1", true), item("2", true), item("3", false)]);
    renderWithProviders(<NotificationsButton />);
    const button = await screen.findByRole("button", { name: t("github.notifications.buttonUnread", { count: 2 }) });
    fireEvent.click(button);
    expect(useNotificationDialogStore.getState().open).toBe(true);
  });

  it("is hidden when there is no account", async () => {
    serve([], []);
    const { container } = renderWithProviders(<NotificationsButton />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("button")).toBeNull();
  });
});
