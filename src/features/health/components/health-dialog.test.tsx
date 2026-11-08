import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { LargeBlob, MaintenanceReport, SizeReport, SparseState } from "../api";
import { useHealthDialogStore } from "../store";
import { HealthDialog } from "./health-dialog";

type Calls = Record<string, Array<Record<string, unknown>>>;

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

const COUNTS = {
  looseObjects: 40,
  looseBytes: 4096,
  packedObjects: 900,
  packs: 2,
  packBytes: 3 * 1024 * 1024,
  prunableObjects: 0,
  garbageFiles: 0,
  garbageBytes: 0,
};

const SIZE: SizeReport = {
  gitDir: "C:/repo/.git",
  gitDirBytes: 5 * 1024 * 1024,
  objects: COUNTS,
  refs: { looseRefs: 4, packedRefs: 10, branches: 3, unmergedBranches: 1, stashes: 2 },
  shallow: true,
  partial: false,
};

const BLOBS: LargeBlob[] = [{ hash: "abcdef1234", size: 2 * 1024 * 1024, path: "assets/video.mp4" }];

const MAINTENANCE: MaintenanceReport = {
  before: COUNTS,
  after: { ...COUNTS, looseObjects: 0, packs: 1 },
  gitDirBefore: 5 * 1024 * 1024,
  gitDirAfter: 4 * 1024 * 1024,
  summary: ["Counting objects: 100% (940/940), done."],
};

function serve(sparse: SparseState = { enabled: false, cone: false, folders: [] }): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    switch (command) {
      case "health_size":
        return SIZE;
      case "health_large_blobs":
        return BLOBS;
      case "health_sparse_state":
        return sparse;
      case "health_sparse_set":
        return { enabled: true, cone: true, folders: (payload as { folders: string[] }).folders };
      case "health_sparse_disable":
        return { enabled: false, cone: false, folders: [] };
      case "health_maintenance":
        return MAINTENANCE;
      default:
        return true;
    }
  });
  return calls;
}

function open() {
  renderWithProviders(<HealthDialog repoPath="C:/repo" />);
  act(() => useHealthDialogStore.getState().show());
}

describe("HealthDialog", () => {
  afterEach(() => {
    act(() => useHealthDialogStore.getState().hide());
  });

  it("loads nothing until it is opened and then shows the size", async () => {
    const calls = serve();
    renderWithProviders(<HealthDialog repoPath="C:/repo" />);
    expect(calls.health_size).toBeUndefined();
    act(() => useHealthDialogStore.getState().show());
    expect(await screen.findByText(t("health.size.total", { size: "5 MB" }))).toBeTruthy();
    expect(screen.getByText(t("health.size.shallow"))).toBeTruthy();
    expect(calls.health_large_blobs).toBeUndefined();
  });

  it("searches the largest files only in its tab", async () => {
    const calls = serve();
    open();
    fireEvent.click(screen.getByRole("tab", { name: t("health.tabs.blobs") }));
    expect(await screen.findByText("assets/video.mp4")).toBeTruthy();
    expect(calls.health_large_blobs?.at(-1)).toMatchObject({ repoPath: "C:/repo" });
    expect(screen.getByText("2 MB")).toBeTruthy();
  });

  it("turns on sparse-checkout for the typed folders after confirming", async () => {
    const calls = serve();
    open();
    fireEvent.click(screen.getByRole("tab", { name: t("health.tabs.sparse") }));
    const field = await screen.findByLabelText(t("health.sparse.folders"));
    fireEvent.change(field, { target: { value: "src\\app\ndocs" } });
    fireEvent.click(screen.getByRole("button", { name: t("health.sparse.enable") }));
    fireEvent.click(await screen.findByRole("button", { name: t("health.sparse.apply") }));
    await waitFor(() => expect(calls.health_sparse_set?.[0]).toMatchObject({ folders: ["src/app", "docs"] }));
  });

  it("refuses folders outside the repository", async () => {
    serve();
    open();
    fireEvent.click(screen.getByRole("tab", { name: t("health.tabs.sparse") }));
    const field = await screen.findByLabelText(t("health.sparse.folders"));
    fireEvent.change(field, { target: { value: "../outside" } });
    expect(screen.getByText(t("health.sparse.invalid", { folder: "../outside" }))).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("health.sparse.enable") }).disabled).toBe(true);
  });

  it("turns sparse-checkout off", async () => {
    const calls = serve({ enabled: true, cone: true, folders: ["app"] });
    open();
    fireEvent.click(screen.getByRole("tab", { name: t("health.tabs.sparse") }));
    fireEvent.click(await screen.findByRole("button", { name: t("health.sparse.disable") }));
    const buttons = await screen.findAllByRole("button", { name: t("health.sparse.disable") });
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
    await waitFor(() => expect(calls.health_sparse_disable).toHaveLength(1));
  });

  it("asks before optimizing and shows how much space was freed", async () => {
    const calls = serve();
    open();
    fireEvent.click(screen.getByRole("tab", { name: t("health.tabs.maintenance") }));
    fireEvent.click(screen.getByRole("button", { name: t("health.maintenance.run") }));
    expect(calls.health_maintenance).toBeUndefined();
    const confirm = await screen.findAllByRole("button", { name: t("health.maintenance.run") });
    fireEvent.click(confirm[confirm.length - 1] as HTMLElement);
    expect(await screen.findByText(t("health.maintenance.result", { before: "5 MB", after: "4 MB", saved: "1 MB" }))).toBeTruthy();
    expect(calls.health_maintenance).toHaveLength(1);
  });
});
