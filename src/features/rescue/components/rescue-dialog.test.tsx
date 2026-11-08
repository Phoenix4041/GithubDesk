import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { RescueDetail, RescueEntry } from "../api";
import { useRescueDialogStore } from "../store";
import { RescueDialog } from "./rescue-dialog";

const SNAPSHOT: RescueEntry = {
  id: "1700000000000-discard",
  reason: "discard",
  label: null,
  kind: "snapshot",
  hash: "a".repeat(40),
  createdAt: 1_700_000_000,
  files: 2,
  additions: 3,
  deletions: 1,
};

const BRANCH: RescueEntry = {
  id: "1700000001000-branch-delete/feature/x",
  reason: "branch-delete",
  label: "feature/x",
  kind: "commit",
  hash: "b".repeat(40),
  createdAt: 1_700_000_001,
  files: 1,
  additions: 1,
  deletions: 0,
};

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(entries: RescueEntry[]): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    if (command === "rescue_list") {
      return entries;
    }
    if (command === "rescue_preview") {
      const entry = entries.find((item) => item.id === args.id) ?? SNAPSHOT;
      const detail: RescueDetail = {
        entry,
        files: [{ path: "src/a.txt", additions: 3, deletions: 1 }],
        patch: "+edited line",
        truncated: false,
      };
      return detail;
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<RescueDialog repoPath="C:/repo" />);
  act(() => useRescueDialogStore.getState().show());
}

describe("RescueDialog", () => {
  afterEach(() => {
    act(() => useRescueDialogStore.getState().hide());
  });

  it("shows an empty state when nothing was saved", async () => {
    serve([]);
    open();
    expect(await screen.findByText(t("rescue.empty.title"))).toBeTruthy();
  });

  it("previews a copy and applies its changes", async () => {
    const calls = serve([SNAPSHOT, BRANCH]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${t("rescue.reasons.discard")}`) }));
    expect(await screen.findByText("+edited line")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("rescue.apply") }));
    await waitFor(() => expect(calls.rescue_restore?.[0]).toMatchObject({ path: "C:/repo", id: SNAPSHOT.id }));
  });

  it("only offers a branch for saved commits and creates it with the typed name", async () => {
    const calls = serve([BRANCH]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${t("rescue.reasons.branch-delete")}`) }));
    await screen.findByLabelText(t("rescue.branchName"));
    expect(screen.queryByRole("button", { name: t("rescue.apply") })).toBeNull();
    const create = screen.getByRole<HTMLButtonElement>("button", { name: t("rescue.createBranch") });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(t("rescue.branchName")), { target: { value: "recovered" } });
    fireEvent.click(create);
    await waitFor(() => expect(calls.rescue_branch?.[0]).toMatchObject({ id: BRANCH.id, name: "recovered" }));
  });

  it("deletes a copy", async () => {
    const calls = serve([SNAPSHOT]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("rescue.delete", { reason: t("rescue.reasons.discard") }) }));
    await waitFor(() => expect(calls.rescue_delete?.[0]).toMatchObject({ id: SNAPSHOT.id }));
  });
});
