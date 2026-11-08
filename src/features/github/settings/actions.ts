import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { targetScope } from "../target";
import type { GithubTarget } from "../target";
import {
  addCollaborator,
  addDeployKey,
  cancelInvitation,
  createHook,
  deleteDeployKey,
  deleteHook,
  deleteRepo,
  pingHook,
  removeCollaborator,
  removeProtection,
  removeTeamAccess,
  setProtection,
  setTeamAccess,
  setTopics,
  transferRepo,
  updateHook,
  updateRepoSettings,
} from "./api";
import type { NewHook } from "./api";
import type { PermissionLevel, ProtectionSettings, RepoSettingsPatch } from "./settings-model";

async function run(target: GithubTarget, work: () => Promise<unknown>, message: (() => string) | null = null): Promise<boolean> {
  try {
    await work();
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    if (message) {
      showToast({ kind: "success", title: message() });
    }
    return true;
  } catch (error) {
    reportError(error);
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return false;
  }
}

export function saveSettings(target: GithubTarget, patch: RepoSettingsPatch, topics: string[] | null): Promise<boolean> {
  return run(
    target,
    async () => {
      if (Object.keys(patch).length > 0) {
        await updateRepoSettings(target, patch);
      }
      if (topics !== null) {
        await setTopics(target, topics);
      }
    },
    () => i18next.t("github.settings.saved"),
  );
}

export function inviteCollaborator(target: GithubTarget, login: string, permission: PermissionLevel): Promise<boolean> {
  return run(target, () => addCollaborator(target, login, permission), () => i18next.t("github.settings.collaborators.invited", { login }));
}

export function changeCollaborator(target: GithubTarget, login: string, permission: PermissionLevel): Promise<boolean> {
  return run(target, () => addCollaborator(target, login, permission), () => i18next.t("github.settings.collaborators.changed", { login }));
}

export function dropCollaborator(target: GithubTarget, login: string): Promise<boolean> {
  return run(target, () => removeCollaborator(target, login), () => i18next.t("github.settings.collaborators.removed", { login }));
}

export function dropInvitation(target: GithubTarget, id: number): Promise<boolean> {
  return run(target, () => cancelInvitation(target, id), () => i18next.t("github.settings.collaborators.cancelled"));
}

export function grantTeam(target: GithubTarget, team: string, permission: PermissionLevel): Promise<boolean> {
  return run(target, () => setTeamAccess(target, team, permission), () => i18next.t("github.settings.teams.saved", { team }));
}

export function revokeTeam(target: GithubTarget, team: string): Promise<boolean> {
  return run(target, () => removeTeamAccess(target, team), () => i18next.t("github.settings.teams.removed", { team }));
}

export function saveProtection(target: GithubTarget, branch: string, settings: ProtectionSettings): Promise<boolean> {
  return run(target, () => setProtection(target, branch, settings), () => i18next.t("github.settings.protection.saved", { branch }));
}

export function dropProtection(target: GithubTarget, branch: string): Promise<boolean> {
  return run(target, () => removeProtection(target, branch), () => i18next.t("github.settings.protection.removed", { branch }));
}

export function addHook(target: GithubTarget, request: NewHook): Promise<boolean> {
  return run(target, () => createHook(target, request), () => i18next.t("github.settings.hooks.created"));
}

export function switchHook(target: GithubTarget, id: number, active: boolean): Promise<boolean> {
  return run(target, () => updateHook(target, id, { active }), null);
}

export function dropHook(target: GithubTarget, id: number): Promise<boolean> {
  return run(target, () => deleteHook(target, id), () => i18next.t("github.settings.hooks.deleted"));
}

export function testHook(target: GithubTarget, id: number): Promise<boolean> {
  return run(target, () => pingHook(target, id), () => i18next.t("github.settings.hooks.pinged"));
}

export function addKey(target: GithubTarget, title: string, key: string, readOnly: boolean): Promise<boolean> {
  return run(target, () => addDeployKey(target, title, key, readOnly), () => i18next.t("github.settings.keys.added"));
}

export function dropKey(target: GithubTarget, id: number): Promise<boolean> {
  return run(target, () => deleteDeployKey(target, id), () => i18next.t("github.settings.keys.deleted"));
}

export function moveRepository(target: GithubTarget, newOwner: string, newName: string | null, confirmation: string): Promise<boolean> {
  return run(target, () => transferRepo(target, newOwner, newName, confirmation), () => i18next.t("github.settings.danger.transferStarted", { owner: newOwner }));
}

export function removeRepository(target: GithubTarget, confirmation: string): Promise<boolean> {
  return run(target, () => deleteRepo(target, confirmation), () => i18next.t("github.settings.danger.deleted", { name: confirmation }));
}
