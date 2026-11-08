import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import type { GithubAccount, OrgSummary, SigningKeys } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useProfileDialogStore } from "../dialog-store";
import type { Profile } from "../profile-model";
import { ProfilesDialog } from "./profiles-dialog";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo Cat",
  avatarUrl: "",
  source: "oauth",
  userId: 583231,
};

const ORGS: OrgSummary[] = [
  { login: "acme", description: null, avatarUrl: "" },
  { login: "labs", description: null, avatarUrl: "" },
];

const KEYS: SigningKeys = {
  gpgAvailable: true,
  gpg: [{ keyId: "ABCD1234", fingerprint: null, user: "Octo <octo@example.com>", created: null, expires: null, expired: false }],
  ssh: [{ path: "C:/Users/octo/.ssh/id_ed25519.pub", kind: "ed25519", comment: "octo@laptop", fingerprint: null }],
};

function serve(options: { orgsFail?: boolean; keys?: SigningKeys } = {}) {
  mockIPC((command) => {
    if (command === "github_accounts_list") {
      return [ACCOUNT];
    }
    if (command === "github_orgs_list") {
      if (options.orgsFail) {
        throw Object.assign(new Error("scope"), { kind: "githubMissingScope", suggestedAction: "grantScopes", detail: "read:org" });
      }
      return ORGS;
    }
    if (command === "signing_keys_list") {
      return options.keys ?? KEYS;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    label: "Personal",
    accountId: ACCOUNT.id,
    org: null,
    name: "Octo Cat",
    email: "octo@example.com",
    signingKey: null,
    signingFormat: "openpgp",
    ...overrides,
  };
}

function open() {
  renderWithProviders(<ProfilesDialog />);
  act(() => useProfileDialogStore.getState().showManage());
}

describe("ProfilesDialog", () => {
  beforeEach(() => {
    useSettingsStore.setState({ profiles: [], activeProfileId: null, repoProfiles: {}, ignoredProfileHints: [] });
  });

  afterEach(() => {
    act(() => useProfileDialogStore.getState().hideManage());
  });

  it("invites the user to create the first profile", async () => {
    serve();
    open();
    expect(await screen.findByText(t("profiles.dialog.empty"))).toBeTruthy();
    expect(screen.getByRole("button", { name: t("profiles.dialog.new") })).toBeTruthy();
  });

  it("starts the editor from the account, with its private email", async () => {
    serve();
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.new") }));
    const email = await screen.findByLabelText<HTMLInputElement>(t("profiles.editor.email"));
    expect(email.value).toBe("583231+octo@users.noreply.github.com");
    expect(screen.getByLabelText<HTMLInputElement>(t("profiles.editor.name")).value).toBe("Octo Cat");
    expect(screen.getByLabelText<HTMLInputElement>(t("profiles.editor.label")).value).toBe("octo");
  });

  it("creates a profile for an organization with a signing key", async () => {
    serve();
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.new") }));
    const context = await screen.findByLabelText<HTMLSelectElement>(t("profiles.editor.context"));
    await waitFor(() => expect(within(context).getByRole("option", { name: "acme" })).toBeTruthy());
    fireEvent.change(context, { target: { value: "acme" } });
    fireEvent.change(screen.getByLabelText(t("profiles.editor.label")), { target: { value: "Acme work" } });
    fireEvent.change(screen.getByLabelText(t("profiles.editor.email")), { target: { value: " octo@acme.test " } });
    const signing = screen.getByLabelText<HTMLSelectElement>(t("profiles.editor.signing"));
    await waitFor(() => expect(within(signing).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(signing, { target: { value: "openpgp:ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: t("profiles.editor.save") }));

    await waitFor(() => expect(useSettingsStore.getState().profiles).toHaveLength(1));
    const saved = useSettingsStore.getState().profiles[0];
    expect(saved).toMatchObject({
      label: "Acme work",
      accountId: ACCOUNT.id,
      org: "acme",
      email: "octo@acme.test",
      signingKey: "ABCD1234",
      signingFormat: "openpgp",
    });
    expect(useSettingsStore.getState().activeProfileId).toBe(saved?.id);
    expect(await screen.findByText("Acme work")).toBeTruthy();
  });

  it("does not save a profile with a broken email", async () => {
    serve();
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.new") }));
    fireEvent.change(await screen.findByLabelText(t("profiles.editor.email")), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: t("profiles.editor.save") }));
    expect(await screen.findByText(t("profiles.editor.errors.invalid"))).toBeTruthy();
    expect(useSettingsStore.getState().profiles).toHaveLength(0);
  });

  it("offers to grant the permission when the organizations cannot be read", async () => {
    serve({ orgsFail: true });
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.new") }));
    expect(await screen.findByText(new RegExp(t("profiles.editor.orgsUnavailable")))).toBeTruthy();
    expect(screen.getByRole("button", { name: t("github.scopes.grant") })).toBeTruthy();
  });

  it("edits and deletes a profile", async () => {
    serve();
    useSettingsStore.setState({ profiles: [profile()], activeProfileId: "p1", repoProfiles: { "C:/a": "p1" } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.edit", { label: "Personal" }) }));
    fireEvent.change(await screen.findByLabelText(t("profiles.editor.label")), { target: { value: "Casa" } });
    fireEvent.click(screen.getByRole("button", { name: t("profiles.editor.save") }));
    await waitFor(() => expect(useSettingsStore.getState().profiles[0]?.label).toBe("Casa"));

    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.remove", { label: "Casa" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("profiles.dialog.removeConfirm") }));
    await waitFor(() => expect(useSettingsStore.getState().profiles).toHaveLength(0));
    expect(useSettingsStore.getState().repoProfiles).toEqual({});
    expect(useSettingsStore.getState().activeProfileId).toBeNull();
  });
});
