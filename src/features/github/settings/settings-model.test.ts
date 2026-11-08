import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROTECTION,
  buildPatch,
  draftFrom,
  formatTopics,
  hasChanges,
  invitationRole,
  looksLikePublicKey,
  mergeMethodsValid,
  newHookEvents,
  parseChecks,
  parseTopics,
  protectionDraftFrom,
  protectionFromDraft,
  roleOf,
  shortKey,
  topicsChanged,
} from "./settings-model";
import type { ProtectionSettings, RepoSettings } from "./settings-model";

const SETTINGS: RepoSettings = {
  name: "app",
  fullName: "acme/app",
  owner: { login: "acme", kind: "Organization" },
  description: "An app",
  homepage: null,
  private: true,
  archived: false,
  fork: false,
  defaultBranch: "main",
  topics: ["rust", "cli"],
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

describe("repository settings model", () => {
  it("an untouched draft changes nothing", () => {
    const draft = draftFrom(SETTINGS);
    expect(buildPatch(SETTINGS, draft)).toEqual({});
    expect(hasChanges(SETTINGS, draft)).toBe(false);
  });

  it("only the edited fields end up in the patch", () => {
    const draft = { ...draftFrom(SETTINGS), description: "  New text ", hasWiki: true, private: false, homepage: " https://x.test " };
    expect(buildPatch(SETTINGS, draft)).toEqual({
      description: "New text",
      homepage: "https://x.test",
      hasWiki: true,
      private: false,
    });
  });

  it("clearing the description or the homepage is a change too", () => {
    const withHome = { ...SETTINGS, homepage: "https://old.test" };
    const draft = { ...draftFrom(withHome), description: "", homepage: "" };
    expect(buildPatch(withHome, draft)).toEqual({ description: "", homepage: "" });
  });

  it("does not send an empty default branch", () => {
    const draft = { ...draftFrom(SETTINGS), defaultBranch: "" };
    expect(buildPatch(SETTINGS, draft)).toEqual({});
    expect(buildPatch(SETTINGS, { ...draftFrom(SETTINGS), defaultBranch: "trunk" })).toEqual({ defaultBranch: "trunk" });
  });

  it("splits and cleans the topics the user typed", () => {
    expect(parseTopics(" Rust, cli  tools\ncli ")).toEqual(["rust", "cli", "tools"]);
    expect(parseTopics("")).toEqual([]);
    expect(formatTopics(["a", "b"])).toBe("a, b");
  });

  it("tells when only the topics changed", () => {
    const draft = { ...draftFrom(SETTINGS), topicsText: "rust, cli, tools" };
    expect(topicsChanged(SETTINGS, draft)).toBe(true);
    expect(hasChanges(SETTINGS, draft)).toBe(true);
    expect(topicsChanged(SETTINGS, { ...draftFrom(SETTINGS), topicsText: "CLI rust" })).toBe(true);
    expect(topicsChanged(SETTINGS, { ...draftFrom(SETTINGS), topicsText: "rust cli" })).toBe(false);
  });

  it("insists on at least one way to merge", () => {
    expect(mergeMethodsValid(draftFrom(SETTINGS))).toBe(true);
    expect(
      mergeMethodsValid({ ...draftFrom(SETTINGS), allowMergeCommit: false, allowSquashMerge: false, allowRebaseMerge: false }),
    ).toBe(false);
  });

  it("names the highest role of a collaborator", () => {
    const base = { admin: false, maintain: false, push: false, triage: false, pull: true };
    expect(roleOf(null)).toBe("pull");
    expect(roleOf(base)).toBe("pull");
    expect(roleOf({ ...base, triage: true })).toBe("triage");
    expect(roleOf({ ...base, triage: true, push: true })).toBe("push");
    expect(roleOf({ ...base, push: true, maintain: true })).toBe("maintain");
    expect(roleOf({ ...base, admin: true, maintain: true, push: true })).toBe("admin");
  });

  it("maps the permission names of an invitation to roles", () => {
    expect(invitationRole("write")).toBe("push");
    expect(invitationRole("admin")).toBe("admin");
    expect(invitationRole("read")).toBe("pull");
    expect(invitationRole("triage")).toBe("triage");
    expect(invitationRole("maintain")).toBe("maintain");
  });
});

describe("branch protection model", () => {
  const remote: ProtectionSettings = {
    requiredReviews: 2,
    dismissStaleReviews: true,
    requireCodeOwnerReviews: false,
    requiredChecks: ["ci", "lint"],
    strictChecks: true,
    enforceAdmins: true,
    requireLinearHistory: false,
    allowForcePushes: false,
    allowDeletions: false,
    requireConversationResolution: true,
  };

  it("turns what GitHub returned into a form and back without losing anything", () => {
    const draft = protectionDraftFrom(remote);
    expect(draft.requireReviews).toBe(true);
    expect(draft.reviewCount).toBe(2);
    expect(draft.checksText).toBe("ci\nlint");
    expect(protectionFromDraft(draft)).toEqual(remote);
  });

  it("sections that are switched off are sent as null and drop their sub-options", () => {
    const draft = { ...protectionDraftFrom(remote), requireReviews: false, requireChecks: false };
    const sent = protectionFromDraft(draft);
    expect(sent.requiredReviews).toBeNull();
    expect(sent.dismissStaleReviews).toBe(false);
    expect(sent.requiredChecks).toBeNull();
    expect(sent.strictChecks).toBe(false);
    expect(sent.enforceAdmins).toBe(true);
  });

  it("keeps the number of reviews between one and six", () => {
    expect(protectionFromDraft({ ...DEFAULT_PROTECTION, reviewCount: 0 }).requiredReviews).toBe(1);
    expect(protectionFromDraft({ ...DEFAULT_PROTECTION, reviewCount: 99 }).requiredReviews).toBe(6);
    expect(protectionFromDraft({ ...DEFAULT_PROTECTION, reviewCount: 2.6 }).requiredReviews).toBe(3);
  });

  it("reads one check name per line and ignores blanks and repeats", () => {
    expect(parseChecks("ci/build\n\n  lint \nci/build\r\ntest")).toEqual(["ci/build", "lint", "test"]);
    expect(parseChecks("")).toEqual([]);
  });

  it("starts a new protection with one required review", () => {
    expect(protectionFromDraft(DEFAULT_PROTECTION).requiredReviews).toBe(1);
    expect(protectionFromDraft(DEFAULT_PROTECTION).requiredChecks).toBeNull();
  });
});

describe("webhooks and deploy keys", () => {
  it("picks the events in the canonical order, or the wildcard", () => {
    expect(newHookEvents(new Set(["issues", "push"]), false)).toEqual(["push", "issues"]);
    expect(newHookEvents(new Set(["push"]), true)).toEqual(["*"]);
    expect(newHookEvents(new Set(), false)).toEqual([]);
  });

  it("only accepts a single-line public key", () => {
    expect(looksLikePublicKey("ssh-ed25519 AAAAC3 comment")).toBe(true);
    expect(looksLikePublicKey(" ecdsa-sha2-nistp256 AAAA ")).toBe(true);
    expect(looksLikePublicKey("-----BEGIN OPENSSH PRIVATE KEY-----")).toBe(false);
    expect(looksLikePublicKey("ssh-rsa AAAA\nssh-rsa BBBB")).toBe(false);
    expect(looksLikePublicKey("")).toBe(false);
  });

  it("shortens long keys for the list", () => {
    const key = `ssh-ed25519 ${"A".repeat(60)} me@laptop`;
    const short = shortKey(key);
    expect(short.startsWith("ssh-ed25519 AAAAAAAAAAAA...")).toBe(true);
    expect(short.length).toBeLessThan(key.length);
    expect(shortKey("ssh-rsa AAAA")).toBe("ssh-rsa AAAA");
  });
});
