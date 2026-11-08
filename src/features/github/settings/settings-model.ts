export type SettingsSection = "general" | "collaborators" | "protection" | "hooks" | "keys" | "danger";

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  "general",
  "collaborators",
  "protection",
  "hooks",
  "keys",
  "danger",
];

export type PermissionLevel = "pull" | "triage" | "push" | "maintain" | "admin";

export const PERMISSION_LEVELS: readonly PermissionLevel[] = ["pull", "triage", "push", "maintain", "admin"];

export interface RepoSettings {
  name: string;
  fullName: string;
  owner: { login: string; kind: string };
  description: string | null;
  homepage: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  defaultBranch: string;
  topics: string[];
  hasIssues: boolean;
  hasWiki: boolean;
  hasProjects: boolean;
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
  allowAutoMerge: boolean;
  deleteBranchOnMerge: boolean;
  htmlUrl: string;
}

export interface RepoSettingsDraft {
  description: string;
  homepage: string;
  topicsText: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  hasIssues: boolean;
  hasWiki: boolean;
  hasProjects: boolean;
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
  allowAutoMerge: boolean;
  deleteBranchOnMerge: boolean;
}

export interface RepoSettingsPatch {
  description?: string;
  homepage?: string;
  defaultBranch?: string;
  private?: boolean;
  archived?: boolean;
  hasIssues?: boolean;
  hasWiki?: boolean;
  hasProjects?: boolean;
  allowMergeCommit?: boolean;
  allowSquashMerge?: boolean;
  allowRebaseMerge?: boolean;
  allowAutoMerge?: boolean;
  deleteBranchOnMerge?: boolean;
}

export function parseTopics(text: string): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const piece of text.split(/[\s,]+/)) {
    const topic = piece.trim().toLowerCase();
    if (topic !== "" && !seen.has(topic)) {
      seen.add(topic);
      topics.push(topic);
    }
  }
  return topics;
}

export function formatTopics(topics: readonly string[]): string {
  return topics.join(", ");
}

export function draftFrom(settings: RepoSettings): RepoSettingsDraft {
  return {
    description: settings.description ?? "",
    homepage: settings.homepage ?? "",
    topicsText: formatTopics(settings.topics),
    defaultBranch: settings.defaultBranch,
    private: settings.private,
    archived: settings.archived,
    hasIssues: settings.hasIssues,
    hasWiki: settings.hasWiki,
    hasProjects: settings.hasProjects,
    allowMergeCommit: settings.allowMergeCommit,
    allowSquashMerge: settings.allowSquashMerge,
    allowRebaseMerge: settings.allowRebaseMerge,
    allowAutoMerge: settings.allowAutoMerge,
    deleteBranchOnMerge: settings.deleteBranchOnMerge,
  };
}

export function buildPatch(settings: RepoSettings, draft: RepoSettingsDraft): RepoSettingsPatch {
  const patch: RepoSettingsPatch = {};
  if (draft.description.trim() !== (settings.description ?? "")) {
    patch.description = draft.description.trim();
  }
  if (draft.homepage.trim() !== (settings.homepage ?? "")) {
    patch.homepage = draft.homepage.trim();
  }
  if (draft.defaultBranch !== settings.defaultBranch && draft.defaultBranch !== "") {
    patch.defaultBranch = draft.defaultBranch;
  }
  const flags = [
    "private",
    "archived",
    "hasIssues",
    "hasWiki",
    "hasProjects",
    "allowMergeCommit",
    "allowSquashMerge",
    "allowRebaseMerge",
    "allowAutoMerge",
    "deleteBranchOnMerge",
  ] as const;
  for (const flag of flags) {
    if (draft[flag] !== settings[flag]) {
      patch[flag] = draft[flag];
    }
  }
  return patch;
}

export function topicsChanged(settings: RepoSettings, draft: RepoSettingsDraft): boolean {
  const next = parseTopics(draft.topicsText);
  return next.length !== settings.topics.length || next.some((topic, index) => topic !== settings.topics[index]);
}

export function hasChanges(settings: RepoSettings, draft: RepoSettingsDraft): boolean {
  return Object.keys(buildPatch(settings, draft)).length > 0 || topicsChanged(settings, draft);
}

export function mergeMethodsValid(draft: RepoSettingsDraft): boolean {
  return draft.allowMergeCommit || draft.allowSquashMerge || draft.allowRebaseMerge;
}

export interface CollaboratorPermissions {
  admin: boolean;
  maintain: boolean;
  push: boolean;
  triage: boolean;
  pull: boolean;
}

export function roleOf(permissions: CollaboratorPermissions | null): PermissionLevel {
  if (!permissions) {
    return "pull";
  }
  if (permissions.admin) {
    return "admin";
  }
  if (permissions.maintain) {
    return "maintain";
  }
  if (permissions.push) {
    return "push";
  }
  if (permissions.triage) {
    return "triage";
  }
  return "pull";
}

export function invitationRole(permissions: string): PermissionLevel {
  switch (permissions) {
    case "admin":
      return "admin";
    case "maintain":
      return "maintain";
    case "write":
    case "push":
      return "push";
    case "triage":
      return "triage";
    default:
      return "pull";
  }
}

export interface ProtectionSettings {
  requiredReviews: number | null;
  dismissStaleReviews: boolean;
  requireCodeOwnerReviews: boolean;
  requiredChecks: string[] | null;
  strictChecks: boolean;
  enforceAdmins: boolean;
  requireLinearHistory: boolean;
  allowForcePushes: boolean;
  allowDeletions: boolean;
  requireConversationResolution: boolean;
}

export interface ProtectionDraft {
  requireReviews: boolean;
  reviewCount: number;
  dismissStaleReviews: boolean;
  requireCodeOwnerReviews: boolean;
  requireChecks: boolean;
  checksText: string;
  strictChecks: boolean;
  enforceAdmins: boolean;
  requireLinearHistory: boolean;
  allowForcePushes: boolean;
  allowDeletions: boolean;
  requireConversationResolution: boolean;
}

export const DEFAULT_PROTECTION: ProtectionDraft = {
  requireReviews: true,
  reviewCount: 1,
  dismissStaleReviews: false,
  requireCodeOwnerReviews: false,
  requireChecks: false,
  checksText: "",
  strictChecks: false,
  enforceAdmins: false,
  requireLinearHistory: false,
  allowForcePushes: false,
  allowDeletions: false,
  requireConversationResolution: false,
};

export function parseChecks(text: string): string[] {
  const seen = new Set<string>();
  const checks: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const check = line.trim();
    if (check !== "" && !seen.has(check)) {
      seen.add(check);
      checks.push(check);
    }
  }
  return checks;
}

export function protectionDraftFrom(settings: ProtectionSettings): ProtectionDraft {
  return {
    requireReviews: settings.requiredReviews !== null,
    reviewCount: Math.max(1, settings.requiredReviews ?? 1),
    dismissStaleReviews: settings.dismissStaleReviews,
    requireCodeOwnerReviews: settings.requireCodeOwnerReviews,
    requireChecks: settings.requiredChecks !== null,
    checksText: (settings.requiredChecks ?? []).join("\n"),
    strictChecks: settings.strictChecks,
    enforceAdmins: settings.enforceAdmins,
    requireLinearHistory: settings.requireLinearHistory,
    allowForcePushes: settings.allowForcePushes,
    allowDeletions: settings.allowDeletions,
    requireConversationResolution: settings.requireConversationResolution,
  };
}

export function protectionFromDraft(draft: ProtectionDraft): ProtectionSettings {
  return {
    requiredReviews: draft.requireReviews ? Math.min(6, Math.max(1, Math.round(draft.reviewCount))) : null,
    dismissStaleReviews: draft.requireReviews && draft.dismissStaleReviews,
    requireCodeOwnerReviews: draft.requireReviews && draft.requireCodeOwnerReviews,
    requiredChecks: draft.requireChecks ? parseChecks(draft.checksText) : null,
    strictChecks: draft.requireChecks && draft.strictChecks,
    enforceAdmins: draft.enforceAdmins,
    requireLinearHistory: draft.requireLinearHistory,
    allowForcePushes: draft.allowForcePushes,
    allowDeletions: draft.allowDeletions,
    requireConversationResolution: draft.requireConversationResolution,
  };
}

export const HOOK_EVENTS: readonly string[] = [
  "push",
  "pull_request",
  "pull_request_review",
  "issues",
  "issue_comment",
  "release",
  "workflow_run",
  "create",
  "delete",
];

export function newHookEvents(selected: ReadonlySet<string>, everything: boolean): string[] {
  if (everything) {
    return ["*"];
  }
  return HOOK_EVENTS.filter((event) => selected.has(event));
}

export function looksLikePublicKey(key: string): boolean {
  const trimmed = key.trim();
  const known = ["ssh-ed25519 ", "ssh-rsa ", "ecdsa-sha2-", "sk-ssh-ed25519@openssh.com ", "sk-ecdsa-sha2-"];
  return known.some((prefix) => trimmed.startsWith(prefix)) && !/[\r\n]/.test(trimmed);
}

export function shortKey(key: string): string {
  const parts = key.trim().split(/\s+/);
  const body = parts[1] ?? "";
  return body.length > 24 ? `${parts[0] ?? ""} ${body.slice(0, 12)}...${body.slice(-8)}` : key.trim();
}
