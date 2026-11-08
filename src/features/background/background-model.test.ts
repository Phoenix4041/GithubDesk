import { describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import {
  BACKGROUND_SYNC_MINUTES,
  clampSyncMinutes,
  pendingCount,
  shouldFetchInBackground,
  syncIntervalMs,
} from "./background-model";
import { trayTooltip } from "./use-tray";

describe("background model", () => {
  it("keeps the minutes between the limits", () => {
    expect(clampSyncMinutes(1)).toBe(BACKGROUND_SYNC_MINUTES.min);
    expect(clampSyncMinutes(0)).toBe(2);
    expect(clampSyncMinutes(7.4)).toBe(7);
    expect(clampSyncMinutes(10_000)).toBe(BACKGROUND_SYNC_MINUTES.max);
    expect(clampSyncMinutes(Number.NaN)).toBe(5);
  });

  it("turns minutes into milliseconds", () => {
    expect(syncIntervalMs(5)).toBe(300_000);
    expect(syncIntervalMs(1)).toBe(120_000);
  });

  it("only fetches when idle, visible and online", () => {
    expect(shouldFetchInBackground({ busy: false, hidden: false, online: true })).toBe(true);
    expect(shouldFetchInBackground({ busy: true, hidden: false, online: true })).toBe(false);
    expect(shouldFetchInBackground({ busy: false, hidden: true, online: true })).toBe(false);
    expect(shouldFetchInBackground({ busy: false, hidden: false, online: false })).toBe(false);
  });

  it("adds unread notifications and the repository waiting to pull", () => {
    expect(pendingCount(0, 0)).toBe(0);
    expect(pendingCount(3, 0)).toBe(3);
    expect(pendingCount(3, 5)).toBe(4);
    expect(pendingCount(-1, 1)).toBe(1);
  });

  it("writes the tooltip with the pending count", async () => {
    await i18next.changeLanguage("es");
    expect(trayTooltip(0)).toBe("GithubDesk");
    expect(trayTooltip(1)).toBe("GithubDesk: 1 pendiente");
    expect(trayTooltip(4)).toBe("GithubDesk: 4 pendientes");
    await i18next.changeLanguage("en");
    expect(trayTooltip(4)).toBe("GithubDesk: 4 pending");
  });
});
