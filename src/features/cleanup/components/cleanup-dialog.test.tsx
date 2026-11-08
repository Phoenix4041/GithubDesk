import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { CleanupPreview, CleanupReport, CleanupRequest, StaleRemoteBranch } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useCleanupDialogStore } from "../store";
import { CleanupDialog } from "./cleanup-dialog";

const REPO = "C:/work/app";

const PREVIEW: CleanupPreview = {
  untracked: [
    { path: "notes.txt", directory: false },
    { path: "scratch", directory: true },
  ],
  ignored: [{ path: "build", directory: true }],
  mergedBranches: [{ name: "feature/done", hash: "abc1234", uniqueCommits: 0 }],
  goneBranches: [{ name: "old-squash", hash: "def5678", uniqueCommits: 3 }],
};

const REPORT: CleanupReport = { removedFiles: 1, deletedBranches: [], prunedBranches: 0, failures: [] };

interface Calls {
  runs: CleanupRequest[];
  staleSearches: number;
}

function serve(preview: CleanupPreview, stale: StaleRemoteBranch[], calls: Calls, report: CleanupReport = REPORT) {
  mockIPC((command, payload) => {
    if (command === "cleanup_preview_get") {
      return preview;
    }
    if (command === "cleanup_stale_remote_get") {
      calls.staleSearches += 1;
      return stale;
    }
    if (command === "cleanup_run") {
      calls.runs.push((payload as unknown as { request: CleanupRequest }).request);
      return report;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<CleanupDialog repoPath={REPO} />);
  act(() => useCleanupDialogStore.getState().show());
}

describe("CleanupDialog", () => {
  afterEach(() => {
    act(() => useCleanupDialogStore.getState().hide());
  });

  it("lists every section and keeps the button off until something is ticked", async () => {
    serve(PREVIEW, [], { runs: [], staleSearches: 0 });
    open();
    expect(await screen.findByLabelText("notes.txt")).toBeTruthy();
    expect(screen.getByLabelText("scratch")).toBeTruthy();
    expect(screen.getByLabelText("build")).toBeTruthy();
    expect(screen.getByLabelText("feature/done")).toBeTruthy();
    expect(screen.getByText(t("cleanup.ownCommits", { count: 3 }))).toBeTruthy();
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: t("cleanup.submit", { count: 0 }) });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("notes.txt"));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("cleanup.submit", { count: 1 }) }).disabled).toBe(false);
  });

  it("asks for confirmation, warns about lost commits and sends only what was ticked", async () => {
    const calls: Calls = { runs: [], staleSearches: 0 };
    serve(PREVIEW, [], calls);
    open();
    fireEvent.click(await screen.findByLabelText("notes.txt"));
    fireEvent.click(screen.getByLabelText("old-squash"));
    fireEvent.click(screen.getByLabelText("feature/done"));
    fireEvent.click(screen.getByRole("button", { name: t("cleanup.submit", { count: 3 }) }));

    expect(await screen.findByText(t("cleanup.confirm.filesLoss", { count: 1 }))).toBeTruthy();
    expect(screen.getByText(t("cleanup.confirm.commitsLoss", { count: 1 }))).toBeTruthy();
    expect(calls.runs).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: t("cleanup.confirm.confirm") }));
    await waitFor(() => expect(calls.runs).toHaveLength(1));
    expect(calls.runs[0]).toEqual({
      untracked: ["notes.txt"],
      ignored: [],
      mergedBranches: ["feature/done"],
      goneBranches: ["old-squash"],
      pruneRemotes: [],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("marks a whole section at once and clears it again", async () => {
    serve(PREVIEW, [], { runs: [], staleSearches: 0 });
    open();
    await screen.findByLabelText("notes.txt");
    const section = screen.getByRole("region", { name: t("cleanup.files.title") });
    const toggle = section.querySelector("button");
    expect(toggle?.textContent).toBe(t("cleanup.selectAll"));
    fireEvent.click(toggle as HTMLButtonElement);
    expect(screen.getByLabelText<HTMLInputElement>("notes.txt").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("scratch").checked).toBe(true);
    fireEvent.click(section.querySelector("button") as HTMLButtonElement);
    expect(screen.getByLabelText<HTMLInputElement>("notes.txt").checked).toBe(false);
  });

  it("only asks the server about stale remote branches when told to", async () => {
    const calls: Calls = { runs: [], staleSearches: 0 };
    serve(PREVIEW, [{ remote: "origin", name: "old-topic" }], calls);
    open();
    await screen.findByLabelText("notes.txt");
    expect(calls.staleSearches).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: t("cleanup.stale.search") }));
    const remote = await screen.findByLabelText("origin");
    expect(calls.staleSearches).toBe(1);
    fireEvent.click(remote);
    fireEvent.click(screen.getByRole("button", { name: t("cleanup.submit", { count: 1 }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("cleanup.confirm.confirm") }));
    await waitFor(() => expect(calls.runs).toHaveLength(1));
    expect(calls.runs[0]?.pruneRemotes).toEqual(["origin"]);
  });

  it("says so when there is nothing to clean", async () => {
    serve({ untracked: [], ignored: [], mergedBranches: [], goneBranches: [] }, [], { runs: [], staleSearches: 0 });
    open();
    expect((await screen.findAllByText(t("cleanup.nothingHere"))).length).toBe(4);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("cleanup.submit", { count: 0 }) }).disabled).toBe(true);
  });
});
