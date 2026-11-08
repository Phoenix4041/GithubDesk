import { Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { changeCollaborator, dropCollaborator, dropInvitation, grantTeam, inviteCollaborator, revokeTeam } from "../actions";
import type { Collaborator, Invitation, TeamAccess } from "../api";
import { useCollaborators, useInvitations, useRepoSettings, useTeamAccess } from "../queries";
import { PERMISSION_LEVELS, invitationRole, roleOf } from "../settings-model";
import type { PermissionLevel } from "../settings-model";
import { QueryError, SectionFrame } from "./section-frame";

interface Props {
  target: GithubTarget;
  canAdmin: boolean;
}

function PermissionSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: PermissionLevel;
  disabled: boolean;
  onChange: (value: PermissionLevel) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as PermissionLevel)}
      className="h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-xs text-fg focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {PERMISSION_LEVELS.map((level) => (
        <option key={level} value={level}>
          {t(`github.settings.roles.${level}`)}
        </option>
      ))}
    </select>
  );
}

function InviteForm({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const [login, setLogin] = useState("");
  const [permission, setPermission] = useState<PermissionLevel>("push");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canAdmin || busy || login.trim() === "") {
      return;
    }
    setBusy(true);
    const invited = await inviteCollaborator(target, login.trim(), permission);
    setBusy(false);
    if (invited) {
      setLogin("");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2" aria-label={t("github.settings.collaborators.inviteTitle")}>
      <div className="min-w-48 flex-1">
        <TextField
          label={t("github.settings.collaborators.login")}
          value={login}
          disabled={!canAdmin || busy}
          onChange={(event) => setLogin(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="w-40">
        <SelectField
          label={t("github.settings.collaborators.permission")}
          value={permission}
          disabled={!canAdmin || busy}
          onChange={(event) => setPermission(event.target.value as PermissionLevel)}
        >
          {PERMISSION_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`github.settings.roles.${level}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <Button type="submit" variant="primary" icon={<UserPlus className="size-3.5" />} disabled={!canAdmin || login.trim() === ""} loading={busy}>
        {t("github.settings.collaborators.invite")}
      </Button>
    </form>
  );
}

function CollaboratorRow({ target, canAdmin, collaborator }: Props & { collaborator: Collaborator }) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const role = roleOf(collaborator.permissions);

  async function remove() {
    setBusy(true);
    await dropCollaborator(target, collaborator.login);
    setBusy(false);
    setRemoving(false);
  }

  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <Avatar url={collaborator.avatarUrl} name={collaborator.login} size={24} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{collaborator.login}</span>
      <PermissionSelect
        label={t("github.settings.collaborators.roleOf", { login: collaborator.login })}
        value={role}
        disabled={!canAdmin}
        onChange={(value) => void changeCollaborator(target, collaborator.login, value)}
      />
      <IconButton label={t("github.settings.collaborators.remove", { login: collaborator.login })} disabled={!canAdmin} onClick={() => setRemoving(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog
        open={removing}
        title={t("github.settings.collaborators.removeTitle", { login: collaborator.login })}
        description={t("github.settings.collaborators.removeDescription")}
        confirmLabel={t("github.settings.collaborators.removeConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </li>
  );
}

function InvitationRow({ target, canAdmin, invitation }: Props & { invitation: Invitation }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <Avatar url={invitation.invitee?.avatarUrl} name={invitation.invitee?.login ?? "?"} size={24} />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {invitation.invitee?.login ?? "?"}{" "}
        <span className="text-xs text-muted">· {t(`github.settings.roles.${invitationRole(invitation.permissions)}`)}</span>
      </span>
      <Button size="sm" disabled={!canAdmin} onClick={() => void dropInvitation(target, invitation.id)}>
        {t("github.settings.collaborators.cancelInvitation")}
      </Button>
    </li>
  );
}

function TeamRow({ target, canAdmin, team }: Props & { team: TeamAccess }) {
  const { t } = useTranslation();
  const level = invitationRole(team.permission);
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[13px]">{team.name || team.slug}</span>
      <PermissionSelect
        label={t("github.settings.teams.roleOf", { team: team.name || team.slug })}
        value={level}
        disabled={!canAdmin}
        onChange={(value) => void grantTeam(target, team.slug, value)}
      />
      <IconButton label={t("github.settings.teams.remove", { team: team.name || team.slug })} disabled={!canAdmin} onClick={() => void revokeTeam(target, team.slug)}>
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

function TeamForm({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const [team, setTeam] = useState("");
  const [permission, setPermission] = useState<PermissionLevel>("push");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canAdmin || busy || team.trim() === "") {
      return;
    }
    setBusy(true);
    const saved = await grantTeam(target, team.trim(), permission);
    setBusy(false);
    if (saved) {
      setTeam("");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2" aria-label={t("github.settings.teams.addTitle")}>
      <div className="min-w-48 flex-1">
        <TextField
          label={t("github.settings.teams.slug")}
          hint={t("github.settings.teams.slugHint")}
          value={team}
          disabled={!canAdmin || busy}
          onChange={(event) => setTeam(event.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="w-40">
        <SelectField
          label={t("github.settings.collaborators.permission")}
          value={permission}
          disabled={!canAdmin || busy}
          onChange={(event) => setPermission(event.target.value as PermissionLevel)}
        >
          {PERMISSION_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`github.settings.roles.${level}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <Button type="submit" disabled={!canAdmin || team.trim() === ""} loading={busy}>
        {t("github.settings.teams.add")}
      </Button>
    </form>
  );
}

export function CollaboratorsSection({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const settings = useRepoSettings(target);
  const collaborators = useCollaborators(target);
  const invitations = useInvitations(target);
  const isOrganization = settings.data?.owner.kind === "Organization";
  const teams = useTeamAccess(target, isOrganization);

  return (
    <SectionFrame title={t("github.settings.sections.collaborators")} description={t("github.settings.collaborators.intro")}>
      <InviteForm target={target} canAdmin={canAdmin} />

      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold">{t("github.settings.collaborators.people")}</h4>
        {collaborators.isPending ? (
          <Skeleton className="h-16" />
        ) : collaborators.isError ? (
          <QueryError error={collaborators.error} onRetry={() => void collaborators.refetch()} />
        ) : collaborators.data.length === 0 ? (
          <p className="text-xs text-muted">{t("github.settings.collaborators.none")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.collaborators.people")}>
            {collaborators.data.map((collaborator) => (
              <CollaboratorRow key={collaborator.login} target={target} canAdmin={canAdmin} collaborator={collaborator} />
            ))}
          </ul>
        )}
      </div>

      {invitations.data && invitations.data.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold">{t("github.settings.collaborators.pending")}</h4>
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.collaborators.pending")}>
            {invitations.data.map((invitation) => (
              <InvitationRow key={invitation.id} target={target} canAdmin={canAdmin} invitation={invitation} />
            ))}
          </ul>
        </div>
      ) : null}

      {isOrganization ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold">{t("github.settings.teams.title")}</h4>
          {teams.isPending ? (
            <Skeleton className="h-12" />
          ) : teams.isError ? (
            <QueryError error={teams.error} onRetry={() => void teams.refetch()} />
          ) : teams.data.length === 0 ? (
            <p className="text-xs text-muted">{t("github.settings.teams.none")}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.teams.title")}>
              {teams.data.map((team) => (
                <TeamRow key={team.slug} target={target} canAdmin={canAdmin} team={team} />
              ))}
            </ul>
          )}
          <TeamForm target={target} canAdmin={canAdmin} />
        </div>
      ) : null}
    </SectionFrame>
  );
}
