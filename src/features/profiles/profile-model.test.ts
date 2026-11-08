import { describe, expect, it } from "vitest";
import type { GithubAccount, Identity, RemoteRepo } from "@/shared/types/git";
import {
  defaultDraft,
  hasErrors,
  identityIsMissing,
  identityMatches,
  noreplyEmail,
  normalizeDraft,
  profileOwner,
  removeProfile,
  suggestProfile,
  validateProfile,
} from "./profile-model";
import type { Profile } from "./profile-model";

const PERSONAL: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo Cat",
  avatarUrl: "",
  source: "oauth",
  userId: 583231,
};
const WORK: GithubAccount = { ...PERSONAL, id: "github.com:octo-work", login: "octo-work", name: null, userId: null };
const ENTERPRISE: GithubAccount = { ...PERSONAL, id: "git.corp.example:octo", host: "git.corp.example" };

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    label: "Personal",
    accountId: PERSONAL.id,
    org: null,
    name: "Octo Cat",
    email: "octo@example.com",
    signingKey: null,
    signingFormat: "openpgp",
    ...overrides,
  };
}

function remote(owner: string, host = "github.com"): RemoteRepo {
  return { remoteName: "origin", url: `https://${host}/${owner}/app.git`, host, owner, name: "app" };
}

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    name: { value: "Octo Cat", scope: "local" },
    email: { value: "octo@example.com", scope: "local" },
    signingKey: null,
    signingEnabled: false,
    ...overrides,
  };
}

describe("profile model", () => {
  it("builds the GitHub private address with or without the numeric id", () => {
    expect(noreplyEmail(PERSONAL)).toBe("583231+octo@users.noreply.github.com");
    expect(noreplyEmail(WORK)).toBe("octo-work@users.noreply.github.com");
  });

  it("starts a draft from the account", () => {
    expect(defaultDraft(PERSONAL, null)).toEqual({
      label: "octo",
      accountId: PERSONAL.id,
      org: null,
      name: "Octo Cat",
      email: "583231+octo@users.noreply.github.com",
      signingKey: null,
      signingFormat: "openpgp",
    });
    const draft = defaultDraft(WORK, "acme");
    expect(draft.label).toBe("acme");
    expect(draft.org).toBe("acme");
    expect(draft.name).toBe("octo-work");
  });

  it("asks for a label, a name and a valid email", () => {
    const base = normalizeDraft({ ...profile(), label: "  ", name: "", email: "nope" });
    const errors = validateProfile(base);
    expect(errors).toEqual({ label: "required", name: "required", email: "invalid" });
    expect(hasErrors(errors)).toBe(true);
    expect(validateProfile({ ...base, email: "" }).email).toBe("required");
    expect(hasErrors(validateProfile(profile()))).toBe(false);
  });

  it("trims what the user typed and drops an empty signing key", () => {
    const clean = normalizeDraft({ ...profile(), label: " Work ", name: " Ana ", email: " a@b.co ", signingKey: "  " });
    expect(clean.label).toBe("Work");
    expect(clean.name).toBe("Ana");
    expect(clean.email).toBe("a@b.co");
    expect(clean.signingKey).toBeNull();
  });

  it("names the owner a profile works for", () => {
    expect(profileOwner(profile(), [PERSONAL])).toBe("octo");
    expect(profileOwner(profile({ org: "acme" }), [PERSONAL])).toBe("acme");
    expect(profileOwner(profile({ accountId: "gone" }), [PERSONAL])).toBeNull();
  });

  it("suggests the profile whose organization or user owns the remote", () => {
    const personal = profile();
    const acme = profile({ id: "p2", label: "Acme", org: "acme" });
    const accounts = [PERSONAL];
    expect(suggestProfile([personal, acme], accounts, remote("acme"))?.id).toBe("p2");
    expect(suggestProfile([personal, acme], accounts, remote("OCTO"))?.id).toBe("p1");
    expect(suggestProfile([personal, acme], accounts, remote("someone-else"))).toBeNull();
  });

  it("does not suggest a profile from another host", () => {
    const corp = profile({ id: "p3", accountId: ENTERPRISE.id });
    expect(suggestProfile([corp], [ENTERPRISE], remote("octo", "github.com"))).toBeNull();
    expect(suggestProfile([corp], [ENTERPRISE], remote("octo", "git.corp.example"))?.id).toBe("p3");
  });

  it("prefers the organization profile when both match the owner", () => {
    const user = profile({ id: "u" });
    const org = profile({ id: "o", org: "octo" });
    expect(suggestProfile([user, org], [PERSONAL], remote("octo"))?.id).toBe("o");
  });

  it("compares the repository identity with a profile", () => {
    expect(identityMatches(identity(), profile())).toBe(true);
    expect(identityMatches(identity({ email: { value: "OCTO@example.com", scope: "local" } }), profile())).toBe(true);
    expect(identityMatches(identity({ name: { value: "Other", scope: "global" } }), profile())).toBe(false);
    expect(identityMatches(identity({ signingKey: { value: "ABC", scope: "local" } }), profile())).toBe(false);
    expect(identityMatches(identity({ signingKey: { value: "ABC", scope: "local" } }), profile({ signingKey: "ABC" }))).toBe(true);
  });

  it("notices when Git has no name or email to commit with", () => {
    expect(identityIsMissing(identity())).toBe(false);
    expect(identityIsMissing(identity({ email: null }))).toBe(true);
    expect(identityIsMissing(identity({ name: null }))).toBe(true);
  });

  it("forgets a deleted profile everywhere", () => {
    const result = removeProfile(
      [profile(), profile({ id: "p2" })],
      { "C:/a": "p1", "C:/b": "p2" },
      "p1",
      "p1",
    );
    expect(result.profiles.map((item) => item.id)).toEqual(["p2"]);
    expect(result.repoProfiles).toEqual({ "C:/b": "p2" });
    expect(result.activeProfileId).toBeNull();
    expect(removeProfile([profile()], {}, "p1", "other").activeProfileId).toBe("p1");
  });
});
