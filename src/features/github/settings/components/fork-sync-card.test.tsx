import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useToastStore } from "@/shared/ui/toast-store";
import { renderWithProviders } from "@/test/render";
import type { GithubTarget } from "../../target";
import type { ForkInfo, ForkSyncResult } from "../forks-api";
import { ForkSyncCard } from "./fork-sync-card";

const TARGET: GithubTarget = { accountId: "github.com:me", host: "github.com", owner: "me", repo: "app", remoteName: "origin" };

const FORK: ForkInfo = {
  isFork: true,
  defaultBranch: "main",
  parent: {
    owner: "acme",
    name: "app",
    fullName: "acme/app",
    cloneUrl: "https://github.com/acme/app.git",
    htmlUrl: "https://github.com/acme/app",
    defaultBranch: "trunk",
  },
};

type Calls = Record<string, Array<Record<string, unknown>>>;

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function serve(info: ForkInfo, result: ForkSyncResult, remotes: string[] = ["origin"]): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    switch (command) {
      case "github_fork_info":
        return info;
      case "github_fork_sync":
        return result;
      case "remote_list":
        return remotes.map((name) => ({ name, url: `https://github.com/x/${name}.git` }));
      default:
        return null;
    }
  });
  return calls;
}

const SYNCED: ForkSyncResult = { status: "fastForward", branch: "main", baseBranch: "acme:trunk", message: "ok" };

describe("the fork sync card", () => {
  afterEach(() => {
    act(() => useToastStore.setState({ toasts: [] }));
  });

  it("stays hidden for a repository that is not a fork", async () => {
    const calls = serve({ isFork: false, defaultBranch: "main", parent: null }, SYNCED);
    renderWithProviders(<ForkSyncCard target={TARGET} repoPath="C:/repo" />);
    await waitFor(() => expect(calls.github_fork_info).toBeDefined());
    expect(screen.queryByRole("button", { name: t("github.fork.sync") })).toBeNull();
  });

  it("syncs the default branch and offers a pull afterwards", async () => {
    const calls = serve(FORK, SYNCED);
    renderWithProviders(<ForkSyncCard target={TARGET} repoPath="C:/repo" />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.fork.sync") }));
    await waitFor(() => expect(calls.github_fork_sync?.[0]).toMatchObject({ owner: "me", repo: "app", branch: "main" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe(t("github.fork.synced", { branch: "main" })));
    expect(useToastStore.getState().toasts[0]?.actions[0]?.label).toBe(t("github.fork.pullNow"));
  });

  it("reports conflicts", async () => {
    serve(FORK, { status: "conflict", branch: "main", baseBranch: "", message: "conflicts" });
    renderWithProviders(<ForkSyncCard target={TARGET} repoPath="C:/repo" />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.fork.sync") }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.kind).toBe("error"));
  });

  it("adds the upstream remote only when it is missing", async () => {
    const calls = serve(FORK, SYNCED);
    renderWithProviders(<ForkSyncCard target={TARGET} repoPath="C:/repo" />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.fork.addRemote") }));
    await waitFor(() =>
      expect(calls.github_fork_add_upstream?.[0]).toMatchObject({ path: "C:/repo", url: "https://github.com/acme/app.git" }),
    );
  });

  it("hides the remote button when upstream exists", async () => {
    serve(FORK, SYNCED, ["origin", "upstream"]);
    renderWithProviders(<ForkSyncCard target={TARGET} repoPath="C:/repo" />);
    await screen.findByRole("button", { name: t("github.fork.sync") });
    await waitFor(() => expect(screen.queryByRole("button", { name: t("github.fork.addRemote") })).toBeNull());
  });
});
