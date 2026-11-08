import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useSettingsStore } from "@/features/settings/store";
import { useTray } from "./use-tray";

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "github_accounts_list") {
      return [];
    }
    return null;
  });
  return calls;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  clearMocks();
  useSettingsStore.setState({ trayEnabled: false });
});

describe("useTray", () => {
  it("removes the tray while the option is off", async () => {
    const calls = serve();
    renderHook(() => useTray(), { wrapper });
    await waitFor(() => expect(calls.tray_set_enabled).toEqual([{ enabled: false, labels: null }]));
    expect(calls.tray_set_pending).toBeUndefined();
  });

  it("creates the tray with translated labels and sends the tooltip", async () => {
    const calls = serve();
    useSettingsStore.setState({ trayEnabled: true });
    renderHook(() => useTray(), { wrapper });
    await waitFor(() =>
      expect(calls.tray_set_enabled?.[0]).toEqual({
        enabled: true,
        labels: {
          open: i18next.t("background.tray.open"),
          fetch: i18next.t("background.tray.fetch"),
          quit: i18next.t("background.tray.quit"),
          tooltip: i18next.t("background.tray.tooltip"),
        },
      }),
    );
    await waitFor(() =>
      expect(calls.tray_set_pending?.[0]).toEqual({ count: 0, tooltip: i18next.t("background.tray.tooltip") }),
    );
  });
});
