import { screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InboxItem } from "@/features/github/home/api";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import type { GithubAccount } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { HomeDashboard } from "./home-dashboard";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo Cat",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

function item(title: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    number: 1,
    title,
    repository: "octo/hello",
    pullRequest: true,
    draft: false,
    htmlUrl: `https://github.com/octo/hello/pull/${title}`,
    updatedAt: "2026-01-01T00:00:00Z",
    author: "ana",
    comments: 0,
    ...overrides,
  };
}

interface Responses {
  accounts: GithubAccount[];
  failing?: "error";
}

function mock(responses: Responses) {
  mockIPC((command) => {
    switch (command) {
      case "github_accounts_list":
        return responses.accounts;
      case "home_repo_states":
        return [{ path: "/work/api", available: true, branch: "dev", dirty: false, ahead: 2, behind: 0 }];
      case "github_inbox":
        return {
          reviewRequested: [item("review-me")],
          assigned: [item("assigned-issue", { pullRequest: false }), item("assigned-pr")],
          authored: [],
        };
      case "github_home_failing":
        if (responses.failing === "error") {
          return Promise.reject(new Error("offline"));
        }
        return [item("broken-ci")];
      case "github_home_mentions":
        return [];
      default:
        return { items: [], nextPage: null };
    }
  });
}

describe("HomeDashboard", () => {
  beforeEach(() => {
    useSettingsStore.setState({ profiles: [], activeProfileId: null });
    useRepositoriesStore.setState({
      recents: [{ path: "/work/api", name: "api", lastOpened: Date.now() }],
      activePath: null,
    });
  });

  afterEach(() => {
    useRepositoriesStore.setState({ recents: [], activePath: null });
  });

  it("greets the active account and shows the recent repository with its branch and state", async () => {
    mock({ accounts: [ACCOUNT] });
    renderWithProviders(<HomeDashboard />);
    expect(await screen.findByText(/Octo/)).toBeTruthy();
    expect(await screen.findByText("api")).toBeTruthy();
    expect(await screen.findByText(/Adelantado 2|Ahead 2/)).toBeTruthy();
    expect(screen.getByText(/dev/)).toBeTruthy();
  });

  it("fills the review, failing CI and issue blocks", async () => {
    mock({ accounts: [ACCOUNT] });
    renderWithProviders(<HomeDashboard />);
    expect(await screen.findByText("review-me")).toBeTruthy();
    expect(await screen.findByText("broken-ci")).toBeTruthy();
    expect(await screen.findByText("assigned-issue")).toBeTruthy();
    expect(screen.queryByText("assigned-pr")).toBeNull();
  });

  it("keeps the other blocks working when one of them fails", async () => {
    mock({ accounts: [ACCOUNT], failing: "error" });
    renderWithProviders(<HomeDashboard />);
    expect(await screen.findByText("review-me")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
  });

  it("offers to connect an account when there is none", async () => {
    mock({ accounts: [] });
    renderWithProviders(<HomeDashboard />);
    expect(await screen.findByText(/Conecta tu cuenta de GitHub|Connect your GitHub account/)).toBeTruthy();
    expect(screen.queryByText("review-me")).toBeNull();
  });
});
