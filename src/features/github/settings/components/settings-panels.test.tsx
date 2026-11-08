import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import { useRepoSettingsStore } from "../store";
import type { SettingsSection } from "../settings-model";
import { SettingsPanel } from "./settings-panels";

const REPO = "C:/work/app";

const REMOTE = { remoteName: "origin", url: "https://github.com/acme/app.git", host: "github.com", owner: "acme", name: "app" };
const ACCOUNT = { id: "github.com:octo", host: "github.com", login: "octo", name: "Octo", avatarUrl: "", source: "oauth", userId: 1 };

const SETTINGS = {
  name: "app",
  fullName: "acme/app",
  owner: { login: "acme", kind: "Organization" },
  description: "An app",
  homepage: null,
  private: true,
  archived: false,
  fork: false,
  defaultBranch: "main",
  topics: ["rust"],
  hasIssues: true,
  hasWiki: false,
  hasProjects: true,
  allowMergeCommit: true,
  allowSquashMerge: true,
  allowRebaseMerge: false,
  allowAutoMerge: false,
  deleteBranchOnMerge: true,
  htmlUrl: "https://github.com/acme/app",
};

const PROTECTION = {
  requiredReviews: 2,
  dismissStaleReviews: true,
  requireCodeOwnerReviews: false,
  requiredChecks: ["ci"],
  strictChecks: true,
  enforceAdmins: true,
  requireLinearHistory: false,
  allowForcePushes: false,
  allowDeletions: false,
  requireConversationResolution: true,
};

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(options: { admin?: boolean } = {}): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    switch (command) {
      case "github_accounts_list":
        return [ACCOUNT];
      case "github_repo_remotes":
        return [REMOTE];
      case "github_repo_info":
        return {
          fullName: "acme/app",
          defaultBranch: "main",
          private: true,
          htmlUrl: "",
          permissions: { admin: options.admin ?? true, push: true, pull: true },
          allowMergeCommit: true,
          allowSquashMerge: true,
          allowRebaseMerge: false,
          hasIssues: true,
        };
      case "github_repo_settings_get":
        return SETTINGS;
      case "github_branches_list":
        return [
          { name: "main", protected: true },
          { name: "dev", protected: false },
        ];
      case "github_protection_get":
        return args.branch === "main" ? PROTECTION : null;
      case "github_collaborators_list":
        return [
          {
            login: "hubot",
            avatarUrl: "",
            htmlUrl: "",
            roleName: "write",
            permissions: { admin: false, maintain: false, push: true, triage: true, pull: true },
          },
        ];
      case "github_invitations_list":
        return [{ id: 9, invitee: { login: "newbie", avatarUrl: "" }, permissions: "write", createdAt: "", htmlUrl: "" }];
      case "github_team_access_list":
        return [{ slug: "core", name: "Core", permission: "push" }];
      case "github_hooks_list":
        return [
          {
            id: 5,
            active: true,
            events: ["push"],
            config: { url: "https://example.com/hook", contentType: "json" },
            lastResponse: { code: 200, status: "active", message: "OK" },
            updatedAt: "",
          },
        ];
      case "github_deploy_keys_list":
        return [{ id: 4, title: "CI", key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyMaterialHere", readOnly: true, verified: true, createdAt: "" }];
      case "github_hook_create":
        return { id: 6, active: true, events: ["push"], config: { url: "https://x", contentType: "json" }, lastResponse: null, updatedAt: "" };
      case "github_deploy_key_add":
        return { id: 5, title: "Deploy", key: "ssh-ed25519 BBBB", readOnly: false, verified: true, createdAt: "" };
      case "github_repo_settings_update":
        return SETTINGS;
      case "github_repo_topics_set":
        return args.topics;
      default:
        return null;
    }
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open(section: SettingsSection) {
  act(() => useRepoSettingsStore.getState().select(section));
  renderWithProviders(<SettingsPanel repoPath={REPO} />);
}

async function enabledButton(name: string): Promise<HTMLButtonElement> {
  const button = await screen.findByRole<HTMLButtonElement>("button", { name });
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

async function lastCall(calls: Calls, command: string): Promise<Record<string, unknown>> {
  await waitFor(() => expect(calls[command]?.length ?? 0).toBeGreaterThan(0));
  const list = calls[command] ?? [];
  return list[list.length - 1] ?? {};
}

describe("repository settings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ repoAccounts: {} });
  });

  afterEach(() => {
    act(() => useRepoSettingsStore.getState().select("general"));
  });

  describe("access", () => {
    it("warns and disables everything when the user is not an administrator", async () => {
      serve({ admin: false });
      open("general");
      expect(await screen.findByText(t("github.settings.readOnly"))).toBeTruthy();
      const description = await screen.findByLabelText<HTMLInputElement>(t("github.settings.general.description"));
      expect(description.disabled).toBe(true);
      expect(screen.getByRole<HTMLButtonElement>("button", { name: t("github.settings.save") }).disabled).toBe(true);
    });
  });

  describe("general", () => {
    it("sends only the changed fields and the new topics", async () => {
      const calls = serve();
      open("general");
      fireEvent.change(await screen.findByLabelText(t("github.settings.general.description")), { target: { value: "A better app" } });
      fireEvent.click(screen.getByLabelText(t("github.settings.general.hasWiki")));
      fireEvent.change(screen.getByLabelText(t("github.settings.general.topics")), { target: { value: "Rust, cli" } });
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.save") }));

      const update = await lastCall(calls, "github_repo_settings_update");
      expect(update.patch).toEqual({ description: "A better app", hasWiki: true });
      const topics = await lastCall(calls, "github_repo_topics_set");
      expect(topics.topics).toEqual(["rust", "cli"]);
    });

    it("asks before making the repository public", async () => {
      const calls = serve();
      open("general");
      fireEvent.click(await screen.findByLabelText(t("github.settings.general.private")));
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.save") }));
      expect(await screen.findByText(t("github.settings.general.confirmPublic"))).toBeTruthy();
      expect(calls.github_repo_settings_update).toBeUndefined();
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
      expect((await lastCall(calls, "github_repo_settings_update")).patch).toEqual({ private: false });
    });

    it("keeps at least one way to merge", async () => {
      serve();
      open("general");
      fireEvent.click(await screen.findByLabelText(t("github.settings.general.allowMergeCommit")));
      fireEvent.click(screen.getByLabelText(t("github.settings.general.allowSquashMerge")));
      expect(screen.getByText(t("github.settings.general.needOneMergeMethod"))).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>("button", { name: t("github.settings.save") }).disabled).toBe(true);
    });
  });

  describe("collaborators", () => {
    it("changes a permission, invites and removes people and cancels an invitation", async () => {
      const calls = serve();
      open("collaborators");
      const role = await screen.findByLabelText<HTMLSelectElement>(t("github.settings.collaborators.roleOf", { login: "hubot" }));
      expect(role.value).toBe("push");
      fireEvent.change(role, { target: { value: "maintain" } });
      expect(await lastCall(calls, "github_collaborator_add")).toMatchObject({ login: "hubot", permission: "maintain" });

      fireEvent.change(screen.getByLabelText(t("github.settings.collaborators.login")), { target: { value: "octocat" } });
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.collaborators.invite") }));
      await waitFor(() => expect(calls.github_collaborator_add).toHaveLength(2));
      expect(calls.github_collaborator_add?.[1]).toMatchObject({ login: "octocat", permission: "push" });

      fireEvent.click(screen.getByRole("button", { name: t("github.settings.collaborators.remove", { login: "hubot" }) }));
      fireEvent.click(await screen.findByRole("button", { name: t("github.settings.collaborators.removeConfirm") }));
      expect(await lastCall(calls, "github_collaborator_remove")).toMatchObject({ login: "hubot" });

      fireEvent.click(await screen.findByRole("button", { name: t("github.settings.collaborators.cancelInvitation") }));
      expect(await lastCall(calls, "github_invitation_cancel")).toMatchObject({ id: 9 });
    });

    it("manages team access for organization repositories", async () => {
      const calls = serve();
      open("collaborators");
      expect(await screen.findByText("Core")).toBeTruthy();
      fireEvent.change(screen.getByLabelText(t("github.settings.teams.roleOf", { team: "Core" })), { target: { value: "admin" } });
      expect(await lastCall(calls, "github_team_access_set")).toMatchObject({ team: "core", permission: "admin" });
      fireEvent.change(screen.getByLabelText(t("github.settings.teams.slug")), { target: { value: "docs" } });
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.teams.add") }));
      await waitFor(() => expect(calls.github_team_access_set).toHaveLength(2));
      expect(calls.github_team_access_set?.[1]).toMatchObject({ team: "docs", permission: "push" });
    });
  });

  describe("protected branches", () => {
    it("shows the rules of a protected branch and saves them", async () => {
      const calls = serve();
      open("protection");
      expect(await screen.findByText(t("github.settings.protection.protectedNow", { branch: "main" }))).toBeTruthy();
      expect(screen.getByLabelText<HTMLInputElement>(t("github.settings.protection.requireReviews")).checked).toBe(true);
      expect(screen.getByLabelText<HTMLInputElement>(t("github.settings.protection.reviewCount")).value).toBe("2");
      fireEvent.click(screen.getByLabelText(t("github.settings.protection.linear")));
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.save") }));
      const call = await lastCall(calls, "github_protection_set");
      expect(call.branch).toBe("main");
      expect(call.settings).toEqual({ ...PROTECTION, requireLinearHistory: true });
    });

    it("removes the protection after a confirmation", async () => {
      const calls = serve();
      open("protection");
      fireEvent.click(await screen.findByRole("button", { name: t("github.settings.protection.remove") }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.protection.remove") }));
      expect(await lastCall(calls, "github_protection_remove")).toMatchObject({ branch: "main" });
    });

    it("protects a branch that had no rules with a sensible start", async () => {
      const calls = serve();
      open("protection");
      const select = await screen.findByLabelText<HTMLSelectElement>(t("github.settings.protection.branch"));
      fireEvent.change(select, { target: { value: "dev" } });
      expect(await screen.findByText(t("github.settings.protection.notProtected", { branch: "dev" }))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.protection.protect") }));
      const call = await lastCall(calls, "github_protection_set");
      expect(call.branch).toBe("dev");
      expect(call.settings).toMatchObject({ requiredReviews: 1, requiredChecks: null, enforceAdmins: false });
    });
  });

  describe("webhooks", () => {
    it("lists hooks, pings and deletes them", async () => {
      const calls = serve();
      open("hooks");
      expect(await screen.findByText("https://example.com/hook")).toBeTruthy();
      expect(screen.getByText(/200/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.hooks.ping") }));
      expect(await lastCall(calls, "github_hook_ping")).toMatchObject({ id: 5 });
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.hooks.remove", { url: "https://example.com/hook" }) }));
      fireEvent.click(await screen.findByRole("button", { name: t("github.settings.hooks.removeConfirm") }));
      expect(await lastCall(calls, "github_hook_delete")).toMatchObject({ id: 5 });
    });

    it("only creates a webhook with an https address and chosen events", async () => {
      const calls = serve();
      open("hooks");
      fireEvent.click(await enabledButton(t("github.settings.hooks.new")));
      const dialog = await screen.findByRole("dialog");
      const create = within(dialog).getByRole<HTMLButtonElement>("button", { name: t("github.settings.hooks.create") });
      fireEvent.change(within(dialog).getByLabelText(t("github.settings.hooks.url")), { target: { value: "http://insecure.test" } });
      expect(create.disabled).toBe(true);
      expect(within(dialog).getByText(t("github.settings.hooks.urlInvalid"))).toBeTruthy();
      fireEvent.change(within(dialog).getByLabelText(t("github.settings.hooks.url")), { target: { value: "https://good.test/hook" } });
      fireEvent.click(within(dialog).getByLabelText("pull_request"));
      fireEvent.change(within(dialog).getByLabelText(t("github.settings.hooks.secret")), { target: { value: "s3cret" } });
      expect(create.disabled).toBe(false);
      fireEvent.click(create);
      const call = await lastCall(calls, "github_hook_create");
      expect(call.request).toEqual({
        url: "https://good.test/hook",
        events: ["push", "pull_request"],
        secret: "s3cret",
        active: true,
      });
    });
  });

  describe("deploy keys", () => {
    it("refuses a private key and adds a public one", async () => {
      const calls = serve();
      open("keys");
      expect(await screen.findByText("CI")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: t("github.settings.keys.new") }));
      const dialog = await screen.findByRole("dialog");
      const add = within(dialog).getByRole<HTMLButtonElement>("button", { name: t("github.settings.keys.add") });
      fireEvent.change(within(dialog).getByLabelText(t("github.settings.keys.titleLabel")), { target: { value: "Deploy" } });
      fireEvent.change(within(dialog).getByLabelText(t("github.settings.keys.keyLabel")), {
        target: { value: "-----BEGIN OPENSSH PRIVATE KEY-----" },
      });
      expect(add.disabled).toBe(true);
      expect(within(dialog).getByText(t("github.settings.keys.keyInvalid"))).toBeTruthy();
      fireEvent.change(within(dialog).getByLabelText(t("github.settings.keys.keyLabel")), { target: { value: "ssh-ed25519 BBBB" } });
      fireEvent.click(within(dialog).getByLabelText(t("github.settings.keys.readOnly")));
      fireEvent.click(add);
      const call = await lastCall(calls, "github_deploy_key_add");
      expect(call).toMatchObject({ title: "Deploy", key: "ssh-ed25519 BBBB", readOnly: false });
    });

    it("deletes a key after confirming", async () => {
      const calls = serve();
      open("keys");
      fireEvent.click(await screen.findByRole("button", { name: t("github.settings.keys.remove", { title: "CI" }) }));
      fireEvent.click(await screen.findByRole("button", { name: t("github.settings.keys.removeConfirm") }));
      expect(await lastCall(calls, "github_deploy_key_delete")).toMatchObject({ id: 4 });
    });
  });

  describe("danger zone", () => {
    it("deletes the repository only after typing its full name", async () => {
      const calls = serve();
      open("danger");
      fireEvent.click(await enabledButton(t("github.settings.danger.delete")));
      const dialog = await screen.findByRole("dialog");
      const confirm = within(dialog).getByRole<HTMLButtonElement>("button", { name: t("github.settings.danger.delete") });
      expect(confirm.disabled).toBe(true);
      fireEvent.change(within(dialog).getByLabelText(t("confirm.typeToConfirm", { value: "acme/app" })), { target: { value: "acme/app" } });
      expect(confirm.disabled).toBe(false);
      expect(calls.github_repo_delete).toBeUndefined();
      fireEvent.click(confirm);
      expect(await lastCall(calls, "github_repo_delete")).toMatchObject({ owner: "acme", repo: "app", confirmation: "acme/app" });
    });

    it("transfers the repository with the typed confirmation", async () => {
      const calls = serve();
      open("danger");
      fireEvent.change(await screen.findByLabelText(t("github.settings.danger.newOwner")), { target: { value: " octo " } });
      fireEvent.click(await enabledButton(t("github.settings.danger.transfer")));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(t("confirm.typeToConfirm", { value: "acme/app" })), { target: { value: "acme/app" } });
      fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.danger.transfer") }));
      expect(await lastCall(calls, "github_repo_transfer")).toMatchObject({
        newOwner: "octo",
        newName: null,
        confirmation: "acme/app",
      });
    });
  });
});
