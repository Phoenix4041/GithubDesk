import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import { useGrantScopesStore } from "@/shared/lib/grant-scopes-store";
import type { DeviceCode, GithubAccount, TokenInfo } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { GrantScopesDialog } from "./grant-scopes-dialog";

const OAUTH: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};
const PERSONAL: GithubAccount = { ...OAUTH, source: "token" };

const CODE: DeviceCode = {
  deviceCode: "dc",
  userCode: "ABCD-1234",
  verificationUri: "https://github.com/login/device",
  expiresIn: 900,
  interval: 5,
};

function info(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    login: "octo",
    scopes: ["repo", "workflow", "read:org"],
    expiresAt: null,
    rateLimit: null,
    capabilities: [
      { id: "repos", request: ["repo"], granted: true },
      { id: "orgRead", request: ["read:org"], granted: true },
      { id: "orgAdmin", request: ["admin:org"], granted: false },
      { id: "sshKeys", request: ["admin:public_key"], granted: false },
    ],
    ...overrides,
  };
}

interface Calls {
  starts: Array<{ host: string; clientId: string; scopes: string[] | null }>;
  finishes: Array<{ expectedLogin: string | null }>;
  tokens: Array<{ host: string; token: string }>;
}

function serve(account: GithubAccount, tokenInfo: TokenInfo, calls: Calls, finishFails = false) {
  mockIPC((command, payload) => {
    if (command === "github_accounts_list") {
      return [account];
    }
    if (command === "github_token_info") {
      return tokenInfo;
    }
    if (command === "github_device_start") {
      calls.starts.push(payload as unknown as Calls["starts"][number]);
      return CODE;
    }
    if (command === "github_device_finish") {
      calls.finishes.push(payload as unknown as Calls["finishes"][number]);
      if (finishFails) {
        throw Object.assign(new Error("mismatch"), { kind: "githubAccountMismatch", suggestedAction: null, detail: "other" });
      }
      return account;
    }
    if (command === "github_account_add_token") {
      calls.tokens.push(payload as unknown as Calls["tokens"][number]);
      return account;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open(request?: Parameters<ReturnType<typeof useGrantScopesStore.getState>["show"]>[0]) {
  renderWithProviders(<GrantScopesDialog />);
  act(() => useGrantScopesStore.getState().show(request));
}

describe("GrantScopesDialog", () => {
  let calls: Calls;

  beforeEach(() => {
    calls = { starts: [], finishes: [], tokens: [] };
    useSettingsStore.setState({ githubClientId: "client-123" });
  });

  afterEach(() => {
    act(() => {
      useGrantScopesStore.getState().hide();
      useSettingsStore.setState({ githubClientId: "" });
    });
  });

  it("only lists the permissions that are missing and preselects the ones the error named", async () => {
    serve(OAUTH, info(), calls);
    open({ scopes: ["admin:org", "write:org"] });
    const orgAdmin = await screen.findByLabelText<HTMLInputElement>(t("github.scopes.capabilities.orgAdmin.name"));
    expect(orgAdmin.checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(t("github.scopes.capabilities.sshKeys.name")).checked).toBe(false);
    expect(screen.queryByLabelText(t("github.scopes.capabilities.repos.name"))).toBeNull();
  });

  it("asks GitHub for the current permissions plus the chosen ones and checks the account", async () => {
    serve(OAUTH, info(), calls);
    open({ scopes: ["admin:org"] });
    await screen.findByLabelText(t("github.scopes.capabilities.orgAdmin.name"));
    fireEvent.click(screen.getByLabelText(t("github.scopes.capabilities.sshKeys.name")));
    fireEvent.click(screen.getByRole("button", { name: t("github.scopes.grant") }));
    await waitFor(() => expect(calls.starts).toHaveLength(1));
    expect(calls.starts[0]).toEqual({
      host: "github.com",
      clientId: "client-123",
      scopes: ["repo", "workflow", "read:org", "admin:org", "admin:public_key"],
    });
    await waitFor(() => expect(calls.finishes).toHaveLength(1));
    expect(calls.finishes[0]?.expectedLogin).toBe("octo");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open when the browser authorized a different account", async () => {
    serve(OAUTH, info(), calls, true);
    open({ scopes: ["admin:org"] });
    await screen.findByLabelText(t("github.scopes.capabilities.orgAdmin.name"));
    fireEvent.click(screen.getByRole("button", { name: t("github.scopes.grant") }));
    await waitFor(() => expect(calls.finishes).toHaveLength(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not offer to grant anything until a permission is ticked", async () => {
    serve(OAUTH, info(), calls);
    open();
    const grant = await screen.findByRole<HTMLButtonElement>("button", { name: t("github.scopes.grant") });
    expect(grant.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(t("github.scopes.capabilities.orgAdmin.name")));
    expect(grant.disabled).toBe(false);
  });

  it("explains that a personal token has to be replaced and swaps it", async () => {
    serve(PERSONAL, info(), calls);
    open({ scopes: ["admin:org"] });
    expect(await screen.findByText(t("github.scopes.tokenSteps"))).toBeTruthy();
    expect(calls.starts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(t("github.scopes.newToken")), { target: { value: "  ghp_newtoken  " } });
    fireEvent.click(screen.getByRole("button", { name: t("github.scopes.replaceToken") }));
    await waitFor(() => expect(calls.tokens).toHaveLength(1));
    expect(calls.tokens[0]).toEqual({ host: "github.com", token: "ghp_newtoken" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("tells fine-grained tokens to be edited on GitHub", async () => {
    serve(
      PERSONAL,
      info({ scopes: null, capabilities: info().capabilities.map((item) => ({ ...item, granted: null })) }),
      calls,
    );
    open();
    expect(await screen.findByText(t("github.scopes.hiddenToken"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("github.scopes.grant") })).toBeNull();
    expect(screen.queryByLabelText(t("github.scopes.newToken"))).toBeNull();
  });

  it("says so when the token already has everything", async () => {
    serve(
      OAUTH,
      info({ capabilities: info().capabilities.map((item) => ({ ...item, granted: true })) }),
      calls,
    );
    open();
    expect(await screen.findByText(t("github.scopes.nothingMissing"))).toBeTruthy();
  });
});
