import { describe, expect, it } from "vitest";
import type { Profile } from "@/features/profiles/profile-model";
import type { GithubAccount } from "@/shared/types/git";
import {
  contextTitle,
  homeContext,
  hostOfUrl,
  pickCloneAccount,
  suggestedRepositoryName,
  validRepositoryName,
} from "./home-model";

function account(login: string, host = "github.com"): GithubAccount {
  return { id: `${host}:${login}`, host, login, name: null, avatarUrl: "", source: "oauth", userId: null };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    label: "Acme",
    accountId: "github.com:octo",
    org: "acme",
    name: "Octo",
    email: "octo@acme.test",
    signingKey: null,
    signingFormat: "openpgp",
    ...overrides,
  };
}

describe("home model", () => {
  const accounts = [account("octo"), account("octo-work")];

  it("uses the active profile for the context", () => {
    const context = homeContext([profile()], "p1", accounts);
    expect(context.account?.login).toBe("octo");
    expect(context.org).toBe("acme");
    expect(contextTitle(context)).toBe("acme");
  });

  it("falls back to the first account when there is no usable profile", () => {
    expect(homeContext([], null, accounts).account?.login).toBe("octo");
    expect(homeContext([profile()], null, accounts).org).toBeNull();
    expect(homeContext([profile({ accountId: "gone" })], "p1", accounts).account?.login).toBe("octo");
    expect(homeContext([], null, []).account).toBeNull();
    expect(contextTitle(homeContext([], null, accounts))).toBe("octo");
  });

  it("reads the host of an http address only", () => {
    expect(hostOfUrl("https://GitHub.com/octo/app.git")).toBe("github.com");
    expect(hostOfUrl("http://127.0.0.1:18765/octo/app")).toBe("127.0.0.1:18765");
    expect(hostOfUrl("git@github.com:octo/app.git")).toBeNull();
    expect(hostOfUrl("not a url")).toBeNull();
    expect(hostOfUrl("ssh://git@github.com/octo/app.git")).toBeNull();
  });

  it("picks the account that matches the address, preferring the active one", () => {
    expect(pickCloneAccount("https://github.com/acme/app.git", accounts, "github.com:octo-work")?.login).toBe("octo-work");
    expect(pickCloneAccount("https://github.com/acme/app.git", accounts, null)?.login).toBe("octo");
    expect(pickCloneAccount("https://github.com/acme/app.git", accounts, "gone")?.login).toBe("octo");
    expect(pickCloneAccount("https://gitlab.com/acme/app.git", accounts, null)).toBeNull();
    expect(pickCloneAccount("git@github.com:acme/app.git", accounts, null)).toBeNull();
  });

  it("validates and suggests repository names", () => {
    expect(validRepositoryName("my-app_2.0")).toBe(true);
    for (const bad of ["", " ", ".", "..", "a b", "a/b", "ñ"]) {
      expect(validRepositoryName(bad)).toBe(false);
    }
    expect(suggestedRepositoryName("My App (copy)")).toBe("My-App-copy");
    expect(suggestedRepositoryName("..")).toBe("");
    expect(suggestedRepositoryName("x".repeat(150))).toHaveLength(100);
  });
});
