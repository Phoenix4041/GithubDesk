import { act, fireEvent, screen } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useGrantScopesStore } from "@/shared/lib/grant-scopes-store";
import type { GithubAccount, TokenInfo } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { AccountsSection } from "../../components/accounts-section";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo Cat",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

function info(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    login: "octo",
    scopes: ["repo"],
    expiresAt: "2099-01-01T00:00:00Z",
    rateLimit: { limit: 5000, remaining: 4321, resetAt: 1_900_000_000 },
    capabilities: [
      { id: "repos", request: ["repo"], granted: true },
      { id: "orgAdmin", request: ["admin:org"], granted: false },
    ],
    ...overrides,
  };
}

function serve(tokenInfo: TokenInfo) {
  mockIPC((command) => {
    if (command === "github_accounts_list") {
      return [ACCOUNT];
    }
    if (command === "github_token_info") {
      return tokenInfo;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

async function expand() {
  renderWithProviders(<AccountsSection />);
  fireEvent.click(await screen.findByRole("button", { name: t("github.scopes.toggle", { login: "octo" }) }));
}

describe("token details in the accounts list", () => {
  afterEach(() => {
    act(() => useGrantScopesStore.getState().hide());
  });

  it("shows what each permission allows and which ones are missing", async () => {
    serve(info());
    await expand();
    expect(await screen.findByText(t("github.scopes.capabilities.repos.name"))).toBeTruthy();
    expect(screen.getByText(t("github.scopes.capabilities.orgAdmin.name"))).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Dar permiso: /i })).toHaveLength(1);
    expect(screen.getByText(/4321 de 5000/)).toBeTruthy();
  });

  it("opens the grant dialog for the permission that was clicked", async () => {
    serve(info());
    await expand();
    fireEvent.click(await screen.findByRole("button", { name: t("github.scopes.grantOne", { name: t("github.scopes.capabilities.orgAdmin.name") }) }));
    expect(useGrantScopesStore.getState().request).toEqual({
      accountId: "github.com:octo",
      scopes: [],
      capabilityIds: ["orgAdmin"],
    });
  });

  it("warns when the token is about to expire", async () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    serve(info({ expiresAt: soon }));
    await expand();
    expect(await screen.findByText(t("github.scopes.expiresSoon", { count: 3 }))).toBeTruthy();
  });

  it("explains the limits of revoking tokens from an application", async () => {
    serve(info({ expiresAt: null, rateLimit: null }));
    await expand();
    expect(await screen.findByText(t("github.scopes.noExpiry"))).toBeTruthy();
    expect(screen.getByText(t("github.scopes.revokeNote"))).toBeTruthy();
  });

  it("says when a token hides its permissions", async () => {
    serve(info({ scopes: null, capabilities: info().capabilities.map((item) => ({ ...item, granted: null })) }));
    await expand();
    expect(await screen.findByText(t("github.scopes.hiddenToken"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Dar permiso: /i })).toBeNull();
  });
});
