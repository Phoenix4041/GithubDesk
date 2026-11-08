import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { useSyncStore } from "@/features/sync/store";
import { TRAY_FETCH_EVENT } from "./api";
import { useBackgroundSync } from "./use-background-sync";

function serve(): string[] {
  const fetched: string[] = [];
  mockIPC(
    (command, payload) => {
      if (command === "remote_fetch") {
        fetched.push(String((payload as Record<string, unknown>).path));
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return fetched;
}

afterEach(() => {
  cleanup();
  clearMocks();
  vi.useRealTimers();
  useSettingsStore.setState({
    backgroundSyncEnabled: false,
    backgroundSyncMinutes: 5,
  });
  useSyncStore.getState().finish();
});

describe("useBackgroundSync", () => {
  it("fetches the open repository once per interval when enabled", async () => {
    vi.useFakeTimers();
    const fetched = serve();
    useSettingsStore.setState({
      backgroundSyncEnabled: true,
      backgroundSyncMinutes: 2,
    });

    renderHook(() => useBackgroundSync("C:/repos/hello"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(119_000);
    });
    expect(fetched).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetched).toEqual(["C:/repos/hello"]);
  });

  it("does nothing while the option is off or another operation runs", async () => {
    vi.useFakeTimers();
    const fetched = serve();
    renderHook(() => useBackgroundSync("C:/repos/hello"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(fetched).toEqual([]);

    useSyncStore.getState().begin({ kind: "push", repoPath: "C:/repos/hello", jobId: "job" });
    await act(async () => {
      useSettingsStore.setState({
        backgroundSyncEnabled: true,
        backgroundSyncMinutes: 2,
      });
      await vi.advanceTimersByTimeAsync(240_000);
    });
    expect(fetched).toEqual([]);
  });

  it("fetches when the tray menu asks for it", async () => {
    const fetched = serve();
    renderHook(() => useBackgroundSync("C:/repos/hello"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    await emit(TRAY_FETCH_EVENT);

    await waitFor(() => expect(fetched).toEqual(["C:/repos/hello"]));
  });
});
