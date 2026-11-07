import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useToastStore } from "@/shared/ui/toast-store";
import type { UpdateStatus } from "./api";
import { CHECK_INTERVAL_MS, LAST_CHECK_KEY, checkForUpdates, shouldCheck } from "./actions";

const NOW = 1_800_000_000_000;

function serve(status: UpdateStatus | Error) {
  let calls = 0;
  mockIPC((command) => {
    if (command === "app_update_check") {
      calls += 1;
      if (status instanceof Error) {
        throw status;
      }
      return status;
    }
    return null;
  });
  return () => calls;
}

const base: UpdateStatus = { configured: true, current: "0.5.0", latest: "0.5.0", updateAvailable: false, url: null };

describe("shouldCheck", () => {
  it("checks when it never ran, when a day has passed or when the stored time is in the future", () => {
    expect(shouldCheck(null, NOW)).toBe(true);
    expect(shouldCheck(NOW - CHECK_INTERVAL_MS, NOW)).toBe(true);
    expect(shouldCheck(NOW + 1000, NOW)).toBe(true);
    expect(shouldCheck(Number.NaN, NOW)).toBe(true);
  });

  it("waits while the last check is recent", () => {
    expect(shouldCheck(NOW - 1000, NOW)).toBe(false);
    expect(shouldCheck(NOW - CHECK_INTERVAL_MS + 1, NOW)).toBe(false);
  });
});

describe("checkForUpdates", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("stays silent and remembers nothing while no repository is configured", async () => {
    serve({ ...base, configured: false });
    await checkForUpdates(false, NOW);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(window.localStorage.getItem(LAST_CHECK_KEY)).toBeNull();
  });

  it("tells the user when asked manually that checking is not active yet", async () => {
    serve({ ...base, configured: false });
    await checkForUpdates(true, NOW);
    expect(useToastStore.getState().toasts[0]?.title).toContain("todavía no está activada");
  });

  it("offers a link to the new version and remembers the check time", async () => {
    serve({ ...base, latest: "0.6.0", updateAvailable: true, url: "https://github.com/o/r/releases/tag/v0.6.0" });
    await checkForUpdates(false, NOW);
    const [toast] = useToastStore.getState().toasts;
    expect(toast?.title).toContain("0.6.0");
    expect(toast?.actions).toHaveLength(1);
    expect(window.localStorage.getItem(LAST_CHECK_KEY)).toBe(String(NOW));
  });

  it("does not ask again within a day unless the user asks", async () => {
    const calls = serve(base);
    window.localStorage.setItem(LAST_CHECK_KEY, String(NOW - 1000));
    await checkForUpdates(false, NOW);
    expect(calls()).toBe(0);
    await checkForUpdates(true, NOW);
    expect(calls()).toBe(1);
  });

  it("confirms a manual check when the app is up to date and says nothing automatically", async () => {
    serve(base);
    await checkForUpdates(false, NOW);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    await checkForUpdates(true, NOW);
    expect(useToastStore.getState().toasts[0]?.title).toContain("última versión");
  });

  it("hides failures from automatic checks and shows them for manual ones", async () => {
    serve(new Error("offline"));
    await checkForUpdates(false, NOW);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    await checkForUpdates(true, NOW);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
