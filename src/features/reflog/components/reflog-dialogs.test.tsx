import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { ReflogEntry, UndoPreview } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useReflogDialogStore } from "../store";
import { ReflogDialogs } from "./reflog-dialogs";

const REPO = "C:/work/app";

const ENTRY: ReflogEntry = {
  index: 1,
  hash: "a".repeat(40),
  shortHash: "aaaaaaa",
  time: 1_700_000_000,
  action: "commit",
  message: "lost work",
};

function previewWith(overrides: Partial<UndoPreview>): UndoPreview {
  return {
    plan: {
      action: "merge",
      strategy: "restoreAll",
      message: "feature",
      currentHash: "c".repeat(40),
      targetHash: "b".repeat(40),
      targetShortHash: "bbbbbbb",
      switchTo: null,
    },
    hasUncommittedChanges: false,
    removedCommits: [{ hash: "d".repeat(40), shortHash: "ddddddd", subject: "merged commit" }],
    restoredCommits: [],
    files: [{ path: "src/main.ts", additions: 3, deletions: 1 }],
    ...overrides,
  };
}

interface Calls {
  undo: Record<string, unknown>[];
  recover: Record<string, unknown>[];
}

function serve(preview: UndoPreview | null, calls: Calls) {
  mockIPC((command, payload) => {
    if (command === "reflog_undo_preview") {
      return preview;
    }
    if (command === "reflog_undo") {
      calls.undo.push(payload as Record<string, unknown>);
      return null;
    }
    if (command === "reflog_recover") {
      calls.recover.push(payload as Record<string, unknown>);
      return null;
    }
    return null;
  });
}

afterEach(() => {
  act(() => useReflogDialogStore.getState().hide());
});

describe("ReflogUndoDialog", () => {
  it("shows the preview and undoes without stashing when the tree is clean", async () => {
    const calls: Calls = { undo: [], recover: [] };
    serve(previewWith({}), calls);
    renderWithProviders(<ReflogDialogs repoPath={REPO} />);
    act(() => useReflogDialogStore.getState().show({ kind: "undo" }));

    expect(await screen.findByText("merged commit")).toBeTruthy();
    expect(screen.getByText("src/main.ts")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: i18next.t("reflog.undoDialog.confirm") });
    fireEvent.click(confirm);

    await waitFor(() => expect(calls.undo).toHaveLength(1));
    expect(calls.undo[0]).toMatchObject({ expectedCurrent: "c".repeat(40), stashFirst: false });
  });

  it("blocks the undo until the user chooses to save the unsaved changes", async () => {
    const calls: Calls = { undo: [], recover: [] };
    serve(previewWith({ hasUncommittedChanges: true }), calls);
    renderWithProviders(<ReflogDialogs repoPath={REPO} />);
    act(() => useReflogDialogStore.getState().show({ kind: "undo" }));

    await screen.findByRole("alert");
    const confirm = screen.getByRole<HTMLButtonElement>("button", { name: i18next.t("reflog.undoDialog.confirm") });
    expect(confirm.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(calls.undo).toHaveLength(1));
    expect(calls.undo[0]).toMatchObject({ stashFirst: true });
  });
});

describe("ReflogRecoverDialog", () => {
  it("creates a branch at the chosen commit", async () => {
    const calls: Calls = { undo: [], recover: [] };
    serve(null, calls);
    renderWithProviders(<ReflogDialogs repoPath={REPO} />);
    act(() => useReflogDialogStore.getState().show({ kind: "recover", entry: ENTRY }));

    const field = await screen.findByRole("textbox");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: i18next.t("reflog.recover.confirm") });
    expect(submit.disabled).toBe(true);

    fireEvent.change(field, { target: { value: "  rescued " } });
    fireEvent.click(submit);

    await waitFor(() => expect(calls.recover).toHaveLength(1));
    expect(calls.recover[0]).toMatchObject({ name: "rescued", hash: ENTRY.hash });
  });
});
