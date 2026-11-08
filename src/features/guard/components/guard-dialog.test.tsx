import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { Finding } from "../api";
import { reviewStagedChanges } from "../review";
import { useGuardStore } from "../store";
import { GuardDialog } from "./guard-dialog";

const SECRET: Finding = { path: "config.js", line: 3, kind: "secret", rule: "generic-secret", level: "warning", size: null };
const BIG: Finding = { path: "data.bin", line: null, kind: "largeFile", rule: "large-file", level: "warning", size: 60 * 1024 * 1024 };

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(findings: Finding[]): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    return command === "guard_scan" ? findings : null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("the commit guard", () => {
  afterEach(() => {
    act(() => useGuardStore.getState().finish("cancel"));
  });

  it("lets a clean commit through without asking", async () => {
    serve([]);
    render(<GuardDialog />);
    expect(await reviewStagedChanges("C:/repo")).toBe(true);
    expect(useGuardStore.getState().request).toBeNull();
  });

  it("does not block the commit when the scan itself fails", async () => {
    mockIPC(() => {
      throw new Error("boom");
    });
    expect(await reviewStagedChanges("C:/repo")).toBe(true);
  });

  it("asks and commits anyway when the user accepts", async () => {
    serve([SECRET, BIG]);
    render(<GuardDialog />);
    const outcome = reviewStagedChanges("C:/repo");
    expect(await screen.findByText("config.js:3")).toBeTruthy();
    expect(screen.getByText(t("guard.largeHint"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("guard.commitAnyway") }));
    expect(await outcome).toBe(true);
  });

  it("cancels the commit", async () => {
    serve([SECRET]);
    render(<GuardDialog />);
    const outcome = reviewStagedChanges("C:/repo");
    fireEvent.click(await screen.findByRole("button", { name: t("guard.cancel") }));
    expect(await outcome).toBe(false);
  });

  it("removes the flagged files from the staged changes and stops the commit", async () => {
    const calls = serve([SECRET, BIG]);
    render(<GuardDialog />);
    const outcome = reviewStagedChanges("C:/repo");
    fireEvent.click(await screen.findByRole("button", { name: t("guard.unstage") }));
    expect(await outcome).toBe(false);
    await waitFor(() => expect(calls.changes_unstage?.[0]).toMatchObject({ paths: ["config.js", "data.bin"] }));
  });

  it("silences one finding and goes on when none are left", async () => {
    const calls = serve([SECRET]);
    render(<GuardDialog />);
    const outcome = reviewStagedChanges("C:/repo");
    fireEvent.click(await screen.findByRole("button", { name: t("guard.silenceLabel", { path: "config.js" }) }));
    expect(await outcome).toBe(true);
    expect(calls.guard_silence?.[0]).toMatchObject({ rule: "generic-secret", file: "config.js" });
  });
});
