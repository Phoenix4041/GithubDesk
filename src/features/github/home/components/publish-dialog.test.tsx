import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import type { GithubAccount, NewRepo } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useGithubHomeDialogStore } from "../store";
import { PublishButton } from "./publish-button";
import { PublishDialog } from "./publish-dialog";

const REPO = "C:/work/my app";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

interface Published {
  path: string;
  accountId: string;
  org: string | null;
  request: NewRepo;
}

function serve(options: { remotes?: unknown[]; accounts?: GithubAccount[]; fail?: boolean } = {}) {
  const published: Published[] = [];
  mockIPC((command, payload) => {
    if (command === "github_accounts_list") {
      return options.accounts ?? [ACCOUNT];
    }
    if (command === "github_repo_remotes") {
      return options.remotes ?? [];
    }
    if (command === "github_orgs_list") {
      return [{ login: "acme", description: null, avatarUrl: "" }];
    }
    if (command === "github_publish_repository") {
      published.push(payload as unknown as Published);
      if (options.fail) {
        throw Object.assign(new Error("no commits"), { kind: "noCommits", suggestedAction: null, detail: "nothing" });
      }
      return { fullName: "octo/my-app", name: "my-app", cloneUrl: "https://github.com/octo/my-app.git" };
    }
    return null;
  });
  return published;
}

const t = (key: ParseKeys) => i18next.t(key);

describe("publishing to GitHub", () => {
  beforeEach(() => {
    useSettingsStore.setState({ profiles: [], activeProfileId: null, repoAccounts: {} });
  });

  afterEach(() => {
    act(() => useGithubHomeDialogStore.getState().hidePublish());
  });

  it("offers the button only for repositories without a GitHub remote and with an account", async () => {
    serve();
    renderWithProviders(<PublishButton repoPath={REPO} />);
    expect(await screen.findByRole("button", { name: t("github.home.publish") })).toBeTruthy();
  });

  it("hides the button when the repository already has a GitHub remote", async () => {
    serve({
      remotes: [{ remoteName: "origin", url: "https://github.com/octo/app.git", host: "github.com", owner: "octo", name: "app" }],
    });
    const { container } = renderWithProviders(<PublishButton repoPath={REPO} />);
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });

  it("hides the button when no account is connected", async () => {
    serve({ accounts: [] });
    const { container } = renderWithProviders(<PublishButton repoPath={REPO} />);
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });

  function open() {
    renderWithProviders(<PublishDialog repoPath={REPO} />);
    act(() => useGithubHomeDialogStore.getState().showPublish());
  }

  it("proposes a name from the folder and publishes without creating a README", async () => {
    const published = serve();
    open();
    const name = await screen.findByLabelText<HTMLInputElement>(t("github.home.createDialog.name"));
    expect(name.value).toBe("my-app");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: t("github.home.publishDialog.submit") });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(published).toHaveLength(1));
    expect(published[0]).toMatchObject({
      path: REPO,
      accountId: ACCOUNT.id,
      org: null,
      request: { name: "my-app", private: true, autoInit: false },
    });
    await waitFor(() => expect(useSettingsStore.getState().repoAccounts[REPO]).toEqual({ accountId: ACCOUNT.id, useForGit: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("publishes inside an organization when chosen", async () => {
    const published = serve();
    open();
    const owner = await screen.findByLabelText<HTMLSelectElement>(t("github.home.createDialog.owner"));
    await waitFor(() => expect(owner.querySelectorAll("option").length).toBe(2));
    fireEvent.change(owner, { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.home.publishDialog.submit") }));
    await waitFor(() => expect(published).toHaveLength(1));
    expect(published[0]?.org).toBe("acme");
  });

  it("asks for the account when there are several", async () => {
    const published = serve({ accounts: [ACCOUNT, { ...ACCOUNT, id: "github.com:octo-work", login: "octo-work" }] });
    open();
    const account = await screen.findByLabelText<HTMLSelectElement>(t("github.home.publishDialog.account"));
    fireEvent.change(account, { target: { value: "github.com:octo-work" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.home.publishDialog.submit") }));
    await waitFor(() => expect(published).toHaveLength(1));
    expect(published[0]?.accountId).toBe("github.com:octo-work");
  });

  it("refuses an invalid name and keeps the dialog open when publishing fails", async () => {
    const published = serve({ fail: true });
    open();
    const name = await screen.findByLabelText(t("github.home.createDialog.name"));
    fireEvent.change(name, { target: { value: "bad name" } });
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: t("github.home.publishDialog.submit") });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    expect(await screen.findByText(t("github.home.createDialog.nameInvalid"))).toBeTruthy();
    expect(published).toHaveLength(0);

    fireEvent.change(name, { target: { value: "good-name" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.home.publishDialog.submit") }));
    await waitFor(() => expect(published).toHaveLength(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(useSettingsStore.getState().repoAccounts[REPO]).toBeUndefined();
  });
});
