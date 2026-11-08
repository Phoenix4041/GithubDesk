import { call } from "@/shared/lib/tauri-client";

export interface Member {
  login: string;
  avatarUrl: string;
}

export interface OrgInvitation {
  id: number;
  login: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface Team {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  privacy: string;
}

export type InviteRole = "direct_member" | "admin" | "billing_manager";

export function getMembership(accountId: string, org: string): Promise<{ role: string; state: string }> {
  return call<{ role: string; state: string }>("github_org_membership", { accountId, org });
}

export function listMembers(accountId: string, org: string, role: "all" | "admin" | "member"): Promise<Member[]> {
  return call<Member[]>("github_org_members", { accountId, org, role });
}

export function setMemberRole(accountId: string, org: string, login: string, role: "admin" | "member"): Promise<void> {
  return call<void>("github_org_member_role", { accountId, org, login, role });
}

export function removeMember(accountId: string, org: string, login: string): Promise<void> {
  return call<void>("github_org_member_remove", { accountId, org, login });
}

export function listInvitations(accountId: string, org: string): Promise<OrgInvitation[]> {
  return call<OrgInvitation[]>("github_org_invitations", { accountId, org });
}

export function inviteMember(accountId: string, org: string, who: string, role: InviteRole): Promise<void> {
  return call<void>("github_org_invite", { accountId, org, who, role });
}

export function cancelOrgInvitation(accountId: string, org: string, id: number): Promise<void> {
  return call<void>("github_org_invitation_cancel", { accountId, org, id });
}

export function listTeams(accountId: string, org: string): Promise<Team[]> {
  return call<Team[]>("github_org_teams", { accountId, org });
}

export function createTeam(accountId: string, org: string, name: string, description: string, secret: boolean): Promise<Team> {
  return call<Team>("github_org_team_create", { accountId, org, name, description, secret });
}

export function deleteTeam(accountId: string, org: string, slug: string): Promise<void> {
  return call<void>("github_org_team_delete", { accountId, org, slug });
}

export function listTeamMembers(accountId: string, org: string, slug: string): Promise<Member[]> {
  return call<Member[]>("github_org_team_members", { accountId, org, slug });
}

export function addTeamMember(accountId: string, org: string, slug: string, login: string): Promise<void> {
  return call<void>("github_org_team_member_add", { accountId, org, slug, login });
}

export function removeTeamMember(accountId: string, org: string, slug: string, login: string): Promise<void> {
  return call<void>("github_org_team_member_remove", { accountId, org, slug, login });
}

export function listOutsideCollaborators(accountId: string, org: string): Promise<Member[]> {
  return call<Member[]>("github_org_outside_collaborators", { accountId, org });
}

export function removeOutsideCollaborator(accountId: string, org: string, login: string): Promise<void> {
  return call<void>("github_org_outside_collaborator_remove", { accountId, org, login });
}
