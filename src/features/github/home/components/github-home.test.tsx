import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import type { GithubAccount, NewRepo, OrgSummary, RepoSummary } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import type { Inbox } from "../api";
import { useGithubHomeDialogStore } from "../store";
import { CreateGithubRepoDialog } from "./create-github-repo-dialog";
import { GithubHome } from "./github-home";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

function repo(name: string, overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name,
    fullName: `octo/${name}`,
    owner: { login: "octo" },
    description: `About ${name}`,
    private: false,
    fork: false,
    archived: false,
    defaultBranch: "main",
    pushedAt: "2026-01-01T00:00:00Z",
    language: "Rust",
    htmlUrl: `https://github.com/octo/${name}`,
    cloneUrl: `https://github.com/octo/${name}.git`,
    sshUrl: `git@github.com:octo/${name}.git`,
    permissions: null,
    ...overrides,
  };
}

const INBOX: Inbox = {
  reviewRequested: [
    {
      number: 7,
      title: "Please review the login",
      repository: "acme/app",
      pullRequest: true,
      draft: false,
      htmlUrl: "https://github.com/acme/app/pull/7",
      updatedAt: "2026-02-01T10:00:00Z",
      author: "hubot",
      comments: 2,
    },
  ],
  assigned: [],
  authored: [],
};

interface Calls {
  repoQueries: Array<{ org: string | null; query: string | null; page: number }>;
  inboxOrgs: Array<string | null>;
  created: Array<{ org: string | null; request: NewRepo }>;
}

function serve(options: { accounts?: GithubAccount[]; pages?: RepoSummary[][]; orgs?: OrgSummary[]; fail?: boolean } = {}) {
  const calls: Calls = { repoQueries: [], inboxOrgs: [], created: [] };
  const pages = options.pages ?? [[repo("alpha"), repo("beta", { private: true })]];
  mockIPC((command, payload) => {
    const args = payload as Record<string, unknown>;
    if (command === "github_accounts_list") {
      return options.accounts ?? [ACCOUNT];
    }
    if (command === "github_orgs_list") {
      return options.orgs ?? [{ login: "acme", description: null, avatarUrl: "" }];
    }
    if (command === "github_context_repos") {
      calls.repoQueries.push({ org: args.org as string | null, query: args.query as string | null, page: args.page as number });
      if (options.fail) {
        throw Object.assign(new Error("boom"), { kind: "githubNetworkUnavailable", suggestedAction: null, detail: "offline" });
      }
      const page = args.page as number;
      return { items: pages[page - 1] ?? [], nextPage: page < pages.length ? page + 1 : null };
    }
    if (command === "github_inbox") {
      calls.inboxOrgs.push(args.org as string | null);
      return INBOX;
    }
    if (command === "github_repo_create") {
      calls.created.push({ org: args.org as string | null, request: args.request as NewRepo });
      return repo((args.request as NewRepo).name);
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("GithubHome", () => {
  beforeEach(() => {
    useSettingsStore.setState({ profiles: [], activeProfileId: null, repoProfiles: {}, ignoredProfileHints: [] });
  });

  afterEach(() => {
    act(() => {
      useRepositoryDialogStore.getState().hide();
      useGithubHomeDialogStore.getState().hideCreate();
    });
  });

  it("invites the user to connect an account when there is none", async () => {
    serve({ accounts: [] });
    renderWithProviders(<GithubHome />);
    expect(await screen.findByText(t("github.home.connectTitle"))).toBeTruthy();
  });

  it("lists the repositories of the first account and starts a clone with that account", async () => {
    serve();
    renderWithProviders(<GithubHome />);
    expect(await screen.findByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("github.home.cloneRepo", { name: "octo/alpha" }) }));
    expect(useRepositoryDialogStore.getState().dialog).toBe("clone");
    expect(useRepositoryDialogStore.getState().clonePreset).toEqual({
      url: "https://github.com/octo/alpha.git",
      accountId: ACCOUNT.id,
    });
  });

  it("follows the active profile into its organization", async () => {
    const calls = serve();
    useSettingsStore.setState({
      profiles: [
        {
          id: "p",
          label: "Acme",
          accountId: ACCOUNT.id,
          org: "acme",
          name: "Octo",
          email: "octo@acme.test",
          signingKey: null,
          signingFormat: "openpgp",
        },
      ],
      activeProfileId: "p",
    });
    renderWithProviders(<GithubHome />);
    await screen.findByText("alpha");
    expect(calls.repoQueries[0]).toEqual({ org: "acme", query: null, page: 1 });
  });

  it("searches by name only when the form is submitted", async () => {
    const calls = serve();
    renderWithProviders(<GithubHome />);
    await screen.findByText("alpha");
    const box = screen.getByRole("searchbox", { name: t("github.home.search") });
    fireEvent.change(box, { target: { value: "  alp " } });
    expect(calls.repoQueries).toHaveLength(1);
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    await waitFor(() => expect(calls.repoQueries).toHaveLength(2));
    expect(calls.repoQueries[1]?.query).toBe("alp");
  });

  it("loads more repositories when there is another page", async () => {
    const calls = serve({ pages: [[repo("alpha")], [repo("gamma")]] });
    renderWithProviders(<GithubHome />);
    await screen.findByText("alpha");
    fireEvent.click(screen.getByRole("button", { name: t("github.home.loadMore") }));
    expect(await screen.findByText("gamma")).toBeTruthy();
    expect(calls.repoQueries.map((entry) => entry.page)).toEqual([1, 2]);
    expect(screen.queryByRole("button", { name: t("github.home.loadMore") })).toBeNull();
  });

  it("says so when nothing matches and offers a retry when loading fails", async () => {
    serve({ pages: [[]] });
    const first = renderWithProviders(<GithubHome />);
    expect(await screen.findByText(t("github.home.noRepos"))).toBeTruthy();
    first.unmount();
    serve({ fail: true });
    renderWithProviders(<GithubHome />);
    expect(await screen.findByRole("button", { name: t("common.retry") })).toBeTruthy();
  });

  it("shows what waits for the user in the second tab", async () => {
    const calls = serve();
    renderWithProviders(<GithubHome />);
    await screen.findByText("alpha");
    fireEvent.click(screen.getByRole("tab", { name: t("github.home.tabs.inbox") }));
    expect(await screen.findByText("Please review the login")).toBeTruthy();
    expect(screen.getByText(/acme\/app#7/)).toBeTruthy();
    expect(screen.getByText(t("github.home.reviewRequested"))).toBeTruthy();
    expect(calls.inboxOrgs).toEqual([null]);
  });
});

describe("CreateGithubRepoDialog", () => {
  beforeEach(() => {
    useSettingsStore.setState({ profiles: [], activeProfileId: null });
  });

  afterEach(() => {
    act(() => {
      useRepositoryDialogStore.getState().hide();
      useGithubHomeDialogStore.getState().hideCreate();
    });
  });

  function open() {
    renderWithProviders(<CreateGithubRepoDialog />);
    act(() => useGithubHomeDialogStore.getState().showCreate());
  }

  it("refuses an invalid name before calling GitHub", async () => {
    const calls = serve();
    open();
    fireEvent.change(await screen.findByLabelText(t("github.home.createDialog.name")), { target: { value: "bad name" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.home.createDialog.submit") }));
    expect(await screen.findByText(t("github.home.createDialog.nameInvalid"))).toBeTruthy();
    expect(calls.created).toHaveLength(0);
  });

  it("creates a private repository with a README for the personal account and offers the clone", async () => {
    const calls = serve();
    open();
    fireEvent.change(await screen.findByLabelText(t("github.home.createDialog.name")), { target: { value: "  hello " } });
    fireEvent.change(screen.getByLabelText(t("github.home.createDialog.descriptionLabel")), { target: { value: "A greeting" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.home.createDialog.submit") }));
    await waitFor(() => expect(calls.created).toHaveLength(1));
    expect(calls.created[0]).toEqual({
      org: null,
      request: {
        name: "hello",
        description: "A greeting",
        private: true,
        autoInit: true,
        gitignoreTemplate: null,
        licenseTemplate: null,
      },
    });
    await waitFor(() => expect(useRepositoryDialogStore.getState().clonePreset?.url).toBe("https://github.com/octo/hello.git"));
  });

  it("creates the repository inside an organization and skips the clone without a README", async () => {
    const calls = serve();
    open();
    const owner = await screen.findByLabelText<HTMLSelectElement>(t("github.home.createDialog.owner"));
    await waitFor(() => expect(owner.querySelectorAll("option").length).toBe(2));
    fireEvent.change(owner, { target: { value: "acme" } });
    fireEvent.change(screen.getByLabelText(t("github.home.createDialog.name")), { target: { value: "tools" } });
    fireEvent.click(screen.getByLabelText(t("github.home.createDialog.readme")));
    fireEvent.click(screen.getByLabelText(t("github.home.createDialog.private")));
    fireEvent.click(screen.getByRole("button", { name: t("github.home.createDialog.submit") }));
    await waitFor(() => expect(calls.created).toHaveLength(1));
    expect(calls.created[0]?.org).toBe("acme");
    expect(calls.created[0]?.request).toMatchObject({ private: false, autoInit: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useRepositoryDialogStore.getState().dialog).toBeNull();
  });
});
