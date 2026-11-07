import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { Branch, NewWorktree, Worktree } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useWorktreeDialogStore } from "../dialog-store";
import { WorktreeDialogs } from "./worktree-dialogs";

const REPO = "C:/work/app";

function branch(name: string): Branch {
  return {
    name,
    fullName: `refs/heads/${name}`,
    isRemote: false,
    remote: null,
    isCurrent: name === "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    tipHash: "abcdef0",
    tipTime: 0,
  };
}

function worktree(path: string, branchName: string | null): Worktree {
  return {
    path,
    head: "abcdef0",
    branch: branchName,
    detached: branchName === null,
    bare: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
    isMain: path === REPO,
    isCurrent: path === REPO,
  };
}

interface Added {
  path: string;
  request: NewWorktree;
}

function serve(branches: Branch[], worktrees: Worktree[], added: Added[]) {
  mockIPC((command, payload) => {
    if (command === "branch_list") {
      return branches;
    }
    if (command === "worktree_list") {
      return worktrees;
    }
    if (command === "worktree_add") {
      added.push(payload as unknown as Added);
      return null;
    }
    return null;
  });
}

const t = (key: ParseKeys) => i18next.t(key);

describe("WorktreeDialogs create dialog", () => {
  let added: Added[];

  beforeEach(() => {
    added = [];
  });

  afterEach(() => {
    act(() => useWorktreeDialogStore.getState().hide());
  });

  function openCreate(branchName?: string) {
    renderWithProviders(<WorktreeDialogs repoPath={REPO} />);
    act(() => useWorktreeDialogStore.getState().show({ kind: "create", branch: branchName }));
  }

  it("proposes a folder next to the repository named after the branch", async () => {
    serve([branch("main"), branch("feature/login")], [worktree(REPO, "main")], added);
    openCreate("feature/login");
    const folder = await screen.findByLabelText<HTMLInputElement>(t("worktrees.createDialog.folderName"));
    expect(folder.value).toBe("app-feature-login");
    expect(screen.getByText(/C:\/work\/app-feature-login/)).toBeTruthy();
  });

  it("only offers the branches that are not already checked out somewhere", async () => {
    serve(
      [branch("main"), branch("feature"), branch("docs")],
      [worktree(REPO, "main"), worktree("C:/work/app-docs", "docs")],
      added,
    );
    openCreate();
    const select = await screen.findByLabelText<HTMLSelectElement>(t("worktrees.createDialog.branch"));
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["feature"]);
  });

  it("starts in new-branch mode when every branch is already in use", async () => {
    serve([branch("main")], [worktree(REPO, "main")], added);
    openCreate();
    expect(await screen.findByLabelText(t("worktrees.createDialog.newBranch"))).toBeTruthy();
  });

  it("keeps the create button disabled until there is something to create", async () => {
    serve([branch("main")], [worktree(REPO, "main")], added);
    openCreate();
    const submit = await screen.findByRole<HTMLButtonElement>("button", { name: t("worktrees.createDialog.submit") });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(t("worktrees.createDialog.newBranch")), { target: { value: "fix/crash" } });
    expect(submit.disabled).toBe(false);
  });

  it("sends the new branch and start point to the backend and closes", async () => {
    serve([branch("main")], [worktree(REPO, "main")], added);
    openCreate();
    fireEvent.change(await screen.findByLabelText(t("worktrees.createDialog.newBranch")), {
      target: { value: "fix/crash" },
    });
    fireEvent.change(screen.getByLabelText(t("worktrees.createDialog.startPoint")), { target: { value: "origin/main" } });
    fireEvent.click(screen.getByRole("button", { name: t("worktrees.createDialog.submit") }));
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]?.path).toBe(REPO);
    expect(added[0]?.request).toEqual({
      path: "C:/work/app-fix-crash",
      branch: null,
      newBranch: "fix/crash",
      startPoint: "origin/main",
      detach: false,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("creates a detached worktree from a revision", async () => {
    serve([branch("main")], [worktree(REPO, "main")], added);
    openCreate();
    await screen.findByLabelText(t("worktrees.createDialog.newBranch"));
    fireEvent.click(screen.getByRole("radio", { name: t("worktrees.createDialog.modes.detached") }));
    fireEvent.change(screen.getByLabelText(t("worktrees.createDialog.revision")), { target: { value: "v1.0" } });
    fireEvent.click(screen.getByRole("button", { name: t("worktrees.createDialog.submit") }));
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]?.request.detach).toBe(true);
    expect(added[0]?.request.startPoint).toBe("v1.0");
    expect(added[0]?.request.branch).toBeNull();
  });
});
