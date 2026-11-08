import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import type { GithubAccount, Identity, IdentityUpdate, RemoteRepo } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useProfileDialogStore } from "../dialog-store";
import type { Profile } from "../profile-model";
import { ApplyProfileDialog } from "./apply-profile-dialog";
import { IdentityLine } from "./identity-line";
import { ProfileHint } from "./profile-hint";
import { ProfileSwitcher } from "./profile-switcher";

const REPO = "C:/work/app";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo Cat",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

const REMOTE: RemoteRepo = {
  remoteName: "origin",
  url: "https://github.com/acme/app.git",
  host: "github.com",
  owner: "acme",
  name: "app",
};

const WORK: Profile = {
  id: "work",
  label: "Acme",
  accountId: ACCOUNT.id,
  org: "acme",
  name: "Octo Work",
  email: "octo@acme.test",
  signingKey: "ABCD1234",
  signingFormat: "openpgp",
};
const HOME: Profile = {
  id: "home",
  label: "Casa",
  accountId: ACCOUNT.id,
  org: null,
  name: "Octo Cat",
  email: "octo@example.com",
  signingKey: null,
  signingFormat: "openpgp",
};

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    name: { value: "Octo Cat", scope: "global" },
    email: { value: "octo@example.com", scope: "global" },
    signingKey: null,
    signingEnabled: false,
    ...overrides,
  };
}

interface Calls {
  applied: Array<{ path: string; update: IdentityUpdate }>;
}

function serve(current: Identity, calls: Calls) {
  mockIPC((command, payload) => {
    if (command === "github_accounts_list") {
      return [ACCOUNT];
    }
    if (command === "github_repo_remotes") {
      return [REMOTE];
    }
    if (command === "identity_get") {
      return current;
    }
    if (command === "identity_apply") {
      calls.applied.push(payload as unknown as Calls["applied"][number]);
      return null;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("repository profiles", () => {
  let calls: Calls;

  beforeEach(() => {
    calls = { applied: [] };
    useSettingsStore.setState({
      profiles: [HOME, WORK],
      activeProfileId: null,
      repoProfiles: {},
      ignoredProfileHints: [],
      repoAccounts: {},
    });
  });

  afterEach(() => {
    act(() => {
      useProfileDialogStore.getState().hideApply();
      useProfileDialogStore.getState().hidePicker();
    });
  });

  describe("the hint", () => {
    it("suggests the profile of the organization that owns the repository", async () => {
      serve(identity(), calls);
      renderWithProviders(<ProfileHint repoPath={REPO} />);
      expect(await screen.findByText(t("profiles.hint.message", { owner: "acme", label: "Acme" }))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: t("profiles.hint.use") }));
      expect(useProfileDialogStore.getState().applying?.profile.id).toBe("work");
    });

    it("stops asking once the user says so", async () => {
      serve(identity(), calls);
      renderWithProviders(<ProfileHint repoPath={REPO} />);
      fireEvent.click(await screen.findByRole("button", { name: t("profiles.hint.never") }));
      expect(useSettingsStore.getState().ignoredProfileHints).toEqual([REPO]);
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    });

    it("stays quiet when the repository already has a profile", async () => {
      serve(identity(), calls);
      useSettingsStore.setState({ repoProfiles: { [REPO]: "home" } });
      const { container } = renderWithProviders(<ProfileHint repoPath={REPO} />);
      await waitFor(() => expect(container.querySelector("[role=status]")).toBeNull());
    });
  });

  describe("applying a profile", () => {
    it("shows what changes and writes the identity, the account and the binding", async () => {
      serve(identity(), calls);
      renderWithProviders(<ApplyProfileDialog repoPath={REPO} />);
      act(() => useProfileDialogStore.getState().showApply({ repoPath: REPO, profile: WORK }));
      expect(await screen.findByText("Octo Cat <octo@example.com>")).toBeTruthy();
      expect(screen.getByText("Octo Work <octo@acme.test>")).toBeTruthy();
      expect(screen.getByText(t("profiles.apply.signingOn", { key: "ABCD1234" }))).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: t("profiles.apply.confirm") }));
      await waitFor(() => expect(calls.applied).toHaveLength(1));
      expect(calls.applied[0]).toEqual({
        path: REPO,
        update: {
          name: "Octo Work",
          email: "octo@acme.test",
          signing: { key: "ABCD1234", format: "openpgp" },
        },
      });
      await waitFor(() => expect(useSettingsStore.getState().repoProfiles[REPO]).toBe("work"));
      expect(useSettingsStore.getState().repoAccounts[REPO]).toEqual({ accountId: ACCOUNT.id, useForGit: true });
      expect(useSettingsStore.getState().activeProfileId).toBe("work");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("sends no signing when the profile has no key", async () => {
      serve(identity(), calls);
      renderWithProviders(<ApplyProfileDialog repoPath={REPO} />);
      act(() => useProfileDialogStore.getState().showApply({ repoPath: REPO, profile: HOME }));
      fireEvent.click(await screen.findByRole("button", { name: t("profiles.apply.confirm") }));
      await waitFor(() => expect(calls.applied).toHaveLength(1));
      expect(calls.applied[0]?.update.signing).toBeNull();
    });

    it("ignores a request that belongs to another repository", () => {
      serve(identity(), calls);
      renderWithProviders(<ApplyProfileDialog repoPath={REPO} />);
      act(() => useProfileDialogStore.getState().showApply({ repoPath: "C:/other", profile: WORK }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("the identity line", () => {
    it("tells who the next commit will be made as", async () => {
      serve(identity(), calls);
      renderWithProviders(<IdentityLine repoPath={REPO} />);
      expect(await screen.findByText(t("profiles.identity.as", { name: "Octo Cat", email: "octo@example.com" }))).toBeTruthy();
    });

    it("warns when Git has no name or email and offers to pick a profile", async () => {
      serve(identity({ email: null }), calls);
      renderWithProviders(<IdentityLine repoPath={REPO} />);
      expect(await screen.findByText(t("profiles.identity.missing"))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: t("profiles.identity.choose") }));
      expect(useProfileDialogStore.getState().pickerOpen).toBe(true);
    });

    it("warns when the identity drifted from the profile of the repository", async () => {
      serve(identity(), calls);
      useSettingsStore.setState({ repoProfiles: { [REPO]: "work" } });
      renderWithProviders(<IdentityLine repoPath={REPO} />);
      expect(await screen.findByText(t("profiles.identity.mismatch", { label: "Acme" }))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: t("profiles.identity.apply", { label: "Acme" }) }));
      expect(useProfileDialogStore.getState().applying?.profile.id).toBe("work");
    });

    it("is quiet when the identity matches the profile", async () => {
      serve(
        identity({
          name: { value: "Octo Work", scope: "local" },
          email: { value: "octo@acme.test", scope: "local" },
          signingKey: { value: "ABCD1234", scope: "local" },
        }),
        calls,
      );
      useSettingsStore.setState({ repoProfiles: { [REPO]: "work" } });
      renderWithProviders(<IdentityLine repoPath={REPO} />);
      await screen.findByText(t("profiles.identity.as", { name: "Octo Work", email: "octo@acme.test" }));
      expect(screen.queryByText(t("profiles.identity.mismatch", { label: "Acme" }))).toBeNull();
    });
  });

  describe("the switcher", () => {
    it("marks the profile of the repository and opens the apply dialog for another one", async () => {
      serve(identity(), calls);
      useSettingsStore.setState({ repoProfiles: { [REPO]: "home" } });
      renderWithProviders(<ProfileSwitcher repoPath={REPO} />);
      fireEvent.click(screen.getByRole("button", { name: t("profiles.switcher", { name: "Casa" }) }));
      const current = await screen.findByRole("menuitemradio", { name: /Casa/ });
      expect(current.getAttribute("aria-checked")).toBe("true");
      expect(screen.getByRole("menuitemradio", { name: /Acme/ }).getAttribute("aria-checked")).toBe("false");
      fireEvent.click(screen.getByRole("menuitemradio", { name: /Acme · acme/ }));
      expect(useProfileDialogStore.getState().applying).toEqual({ repoPath: REPO, profile: WORK });
    });

    it("only sets the active profile when no repository is open", async () => {
      serve(identity(), calls);
      renderWithProviders(<ProfileSwitcher repoPath={null} />);
      fireEvent.click(screen.getByRole("button", { name: t("profiles.switcher", { name: t("profiles.none") }) }));
      fireEvent.click(await screen.findByRole("menuitemradio", { name: /Acme · acme/ }));
      expect(useSettingsStore.getState().activeProfileId).toBe("work");
      expect(useProfileDialogStore.getState().applying).toBeNull();
    });

    it("offers to create a profile when there are none", async () => {
      serve(identity(), calls);
      useSettingsStore.setState({ profiles: [] });
      renderWithProviders(<ProfileSwitcher repoPath={REPO} />);
      fireEvent.click(screen.getByRole("button", { name: t("profiles.switcher", { name: t("profiles.none") }) }));
      fireEvent.click(await screen.findByRole("menuitem", { name: t("profiles.create") }));
      expect(useProfileDialogStore.getState().manageOpen).toBe(true);
      act(() => useProfileDialogStore.getState().hideManage());
    });
  });
});
