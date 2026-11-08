import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { PatchApplyMode, PatchPreview } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { usePatchDialogStore } from "../store";
import { PatchDialog } from "./patch-dialog";

const REPO = "C:/work/app";
const FILE = "C:/patches/0001-add-login.patch";

function preview(overrides: Partial<PatchPreview> = {}): PatchPreview {
  return {
    file: FILE,
    mailbox: true,
    subject: "Add login",
    author: "Ana <ana@example.com>",
    changes: [
      { path: "src/login.ts", insertions: 12, deletions: 2 },
      { path: "src/app.ts", insertions: 3, deletions: 0 },
    ],
    appliesCleanly: true,
    problem: null,
    ...overrides,
  };
}

interface Applied {
  path: string;
  files: string[];
  mode: PatchApplyMode;
}

function serve(previews: PatchPreview[], applied: Applied[], failure?: { kind: string; detail: string }) {
  mockIPC((command, payload) => {
    if (command === "patch_preview") {
      return previews;
    }
    if (command === "patch_apply") {
      applied.push(payload as unknown as Applied);
      if (failure) {
        throw Object.assign(new Error(failure.detail), {
          kind: failure.kind,
          suggestedAction: null,
          detail: failure.detail,
        });
      }
      return null;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open(files: string[] = [FILE]) {
  renderWithProviders(<PatchDialog repoPath={REPO} />);
  act(() => usePatchDialogStore.getState().show(files));
}

describe("PatchDialog", () => {
  afterEach(() => {
    act(() => usePatchDialogStore.getState().hide());
  });

  it("shows the subject, author and size of the patch and picks commits by default", async () => {
    serve([preview()], []);
    open();
    expect(await screen.findByText("Add login")).toBeTruthy();
    expect(screen.getByText("Ana <ana@example.com>")).toBeTruthy();
    expect(screen.getByText(/\+15/)).toBeTruthy();
    expect(screen.getByText(/-2/)).toBeTruthy();
    expect(screen.getByText(t("patches.dialog.applies"))).toBeTruthy();
    const commit = screen.getByRole("radio", { name: new RegExp(t("patches.dialog.modes.commit.label")) });
    expect(commit.getAttribute("aria-checked")).toBe("true");
  });

  it("sends the files and the chosen mode and closes", async () => {
    const applied: Applied[] = [];
    serve([preview()], applied);
    open();
    await screen.findByText("Add login");
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(t("patches.dialog.modes.workingTree.label")) }));
    fireEvent.click(screen.getByRole("button", { name: t("patches.dialog.submit") }));
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toEqual({ path: REPO, files: [FILE], mode: "workingTree" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("disables the commit mode when a file carries no commit data", async () => {
    const applied: Applied[] = [];
    serve([preview({ mailbox: false, subject: null, author: null })], applied);
    open();
    expect(await screen.findByText(t("patches.dialog.needsMailbox"))).toBeTruthy();
    const commit = screen.getByRole<HTMLButtonElement>("radio", {
      name: new RegExp(t("patches.dialog.modes.commit.label")),
    });
    expect(commit.disabled).toBe(true);
    expect(screen.getByText("0001-add-login.patch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("patches.dialog.submit") }));
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]?.mode).toBe("workingTree");
  });

  it("explains when the patch does not fit as it is", async () => {
    serve([preview({ appliesCleanly: false, problem: "patch does not apply" })], []);
    open();
    expect(await screen.findByText(/patch does not apply/)).toBeTruthy();
  });

  it("closes after a conflict so the operation banner can take over", async () => {
    const applied: Applied[] = [];
    serve([preview()], applied, { kind: "mergeConflict", detail: "CONFLICT (content)" });
    open();
    await screen.findByText("Add login");
    fireEvent.click(screen.getByRole("button", { name: t("patches.dialog.submit") }));
    await waitFor(() => expect(applied).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("stays open when the apply fails for another reason", async () => {
    const applied: Applied[] = [];
    serve([preview()], applied, { kind: "patchNotApplicable", detail: "does not apply" });
    open();
    await screen.findByText("Add login");
    fireEvent.click(screen.getByRole("button", { name: t("patches.dialog.submit") }));
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
