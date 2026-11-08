import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";
import type { PermissionLevel, ProtectionSettings, RepoSettings, RepoSettingsPatch } from "./settings-model";

function base(target: GithubTarget) {
  return { accountId: target.accountId, owner: target.owner, repo: target.repo };
}

export interface Collaborator {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  roleName: string;
  permissions: { admin: boolean; maintain: boolean; push: boolean; triage: boolean; pull: boolean } | null;
}

export interface Invitation {
  id: number;
  invitee: { login: string; avatarUrl: string } | null;
  permissions: string;
  createdAt: string;
  htmlUrl: string;
}

export interface TeamAccess {
  slug: string;
  name: string;
  permission: string;
}

export interface BranchEntry {
  name: string;
  protected: boolean;
}

export interface Hook {
  id: number;
  active: boolean;
  events: string[];
  config: { url: string; contentType: string };
  lastResponse: { code: number | null; status: string | null; message: string | null } | null;
  updatedAt: string;
}

export interface NewHook {
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
}

export interface DeployKey {
  id: number;
  title: string;
  key: string;
  readOnly: boolean;
  verified: boolean;
  createdAt: string;
}

export function getRepoSettings(target: GithubTarget): Promise<RepoSettings> {
  return call<RepoSettings>("github_repo_settings_get", base(target));
}

export function updateRepoSettings(target: GithubTarget, patch: RepoSettingsPatch): Promise<RepoSettings> {
  return call<RepoSettings>("github_repo_settings_update", { ...base(target), patch });
}

export function setTopics(target: GithubTarget, topics: string[]): Promise<string[]> {
  return call<string[]>("github_repo_topics_set", { ...base(target), topics });
}

export function listCollaborators(target: GithubTarget): Promise<Collaborator[]> {
  return call<Collaborator[]>("github_collaborators_list", base(target));
}

export function addCollaborator(target: GithubTarget, login: string, permission: PermissionLevel): Promise<void> {
  return call<void>("github_collaborator_add", { ...base(target), login, permission });
}

export function removeCollaborator(target: GithubTarget, login: string): Promise<void> {
  return call<void>("github_collaborator_remove", { ...base(target), login });
}

export function listInvitations(target: GithubTarget): Promise<Invitation[]> {
  return call<Invitation[]>("github_invitations_list", base(target));
}

export function cancelInvitation(target: GithubTarget, id: number): Promise<void> {
  return call<void>("github_invitation_cancel", { ...base(target), id });
}

export function listTeamAccess(target: GithubTarget): Promise<TeamAccess[]> {
  return call<TeamAccess[]>("github_team_access_list", base(target));
}

export function setTeamAccess(target: GithubTarget, team: string, permission: PermissionLevel): Promise<void> {
  return call<void>("github_team_access_set", { ...base(target), team, permission });
}

export function removeTeamAccess(target: GithubTarget, team: string): Promise<void> {
  return call<void>("github_team_access_remove", { ...base(target), team });
}

export function transferRepo(target: GithubTarget, newOwner: string, newName: string | null, confirmation: string): Promise<void> {
  return call<void>("github_repo_transfer", { ...base(target), newOwner, newName, confirmation });
}

export function deleteRepo(target: GithubTarget, confirmation: string): Promise<void> {
  return call<void>("github_repo_delete", { ...base(target), confirmation });
}

export function listBranches(target: GithubTarget): Promise<BranchEntry[]> {
  return call<BranchEntry[]>("github_branches_list", base(target));
}

export function getProtection(target: GithubTarget, branch: string): Promise<ProtectionSettings | null> {
  return call<ProtectionSettings | null>("github_protection_get", { ...base(target), branch });
}

export function setProtection(target: GithubTarget, branch: string, settings: ProtectionSettings): Promise<void> {
  return call<void>("github_protection_set", { ...base(target), branch, settings });
}

export function removeProtection(target: GithubTarget, branch: string): Promise<void> {
  return call<void>("github_protection_remove", { ...base(target), branch });
}

export function listHooks(target: GithubTarget): Promise<Hook[]> {
  return call<Hook[]>("github_hooks_list", base(target));
}

export function createHook(target: GithubTarget, request: NewHook): Promise<Hook> {
  return call<Hook>("github_hook_create", { ...base(target), request });
}

export function updateHook(target: GithubTarget, id: number, update: { active?: boolean; events?: string[] }): Promise<Hook> {
  return call<Hook>("github_hook_update", { ...base(target), id, update });
}

export function deleteHook(target: GithubTarget, id: number): Promise<void> {
  return call<void>("github_hook_delete", { ...base(target), id });
}

export function pingHook(target: GithubTarget, id: number): Promise<void> {
  return call<void>("github_hook_ping", { ...base(target), id });
}

export function listDeployKeys(target: GithubTarget): Promise<DeployKey[]> {
  return call<DeployKey[]>("github_deploy_keys_list", base(target));
}

export function addDeployKey(target: GithubTarget, title: string, key: string, readOnly: boolean): Promise<DeployKey> {
  return call<DeployKey>("github_deploy_key_add", { ...base(target), title, key, readOnly });
}

export function deleteDeployKey(target: GithubTarget, id: number): Promise<void> {
  return call<void>("github_deploy_key_delete", { ...base(target), id });
}
