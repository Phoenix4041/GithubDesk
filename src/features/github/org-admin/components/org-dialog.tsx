import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField, TextField } from "@/shared/ui/text-field";
import { TypedConfirmDialog } from "@/shared/ui/typed-confirm-dialog";
import { showToast } from "@/shared/ui/toast-store";
import { i18next } from "@/i18n";
import { QueryError, ToggleRow } from "../../settings/components/section-frame";
import { SecretsSection } from "../../settings/components/secrets-section";
import {
  addTeamMember,
  cancelOrgInvitation,
  createTeam,
  deleteTeam,
  getMembership,
  inviteMember,
  listInvitations,
  listMembers,
  listOutsideCollaborators,
  listTeamMembers,
  listTeams,
  removeMember,
  removeOutsideCollaborator,
  removeTeamMember,
  setMemberRole,
} from "../api";
import type { InviteRole, Member, Team } from "../api";
import { useOrgDialogStore } from "../store";
import type { OrgTarget } from "../store";

type Tab = "members" | "invitations" | "teams" | "outside" | "secrets";
const TABS: readonly Tab[] = ["members", "invitations", "teams", "outside", "secrets"];
const ROOT = ["github", "org-admin"] as const;

async function perform(work: () => Promise<unknown>, message: () => string): Promise<boolean> {
  try {
    await work();
    await queryClient.invalidateQueries({ queryKey: ROOT });
    showToast({ kind: "success", title: message() });
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

interface Props {
  target: OrgTarget;
  canAdmin: boolean;
}

function PersonRow({ person, actions }: { person: Member; actions: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <Avatar url={person.avatarUrl} name={person.login} size={24} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{person.login}</span>
      {actions}
    </li>
  );
}

function MembersTab({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const all = useQuery({ queryKey: [...ROOT, target.org, "members", "all"], queryFn: () => listMembers(target.accountId, target.org, "all"), retry: false });
  const admins = useQuery({ queryKey: [...ROOT, target.org, "members", "admin"], queryFn: () => listMembers(target.accountId, target.org, "admin"), retry: false });
  const [removing, setRemoving] = useState<string | null>(null);
  const adminLogins = new Set((admins.data ?? []).map((member) => member.login));

  if (all.isPending) {
    return <Skeleton className="h-24" />;
  }
  if (all.isError) {
    return <QueryError error={all.error} onRetry={() => void all.refetch()} />;
  }
  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.org.tabs.members")}>
        {all.data.map((member) => {
          const isAdmin = adminLogins.has(member.login);
          return (
            <PersonRow
              key={member.login}
              person={member}
              actions={
                <>
                  <select
                    aria-label={t("github.org.roleOf", { login: member.login })}
                    value={isAdmin ? "admin" : "member"}
                    disabled={!canAdmin}
                    onChange={(event) =>
                      void perform(
                        () => setMemberRole(target.accountId, target.org, member.login, event.target.value === "admin" ? "admin" : "member"),
                        () => i18next.t("github.org.roleChanged", { login: member.login }),
                      )
                    }
                    className="h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="member">{t("github.org.roles.member")}</option>
                    <option value="admin">{t("github.org.roles.admin")}</option>
                  </select>
                  <IconButton label={t("github.org.removeMember", { login: member.login })} disabled={!canAdmin} onClick={() => setRemoving(member.login)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </>
              }
            />
          );
        })}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={t("github.org.removeMemberTitle", { login: removing ?? "" })}
        description={t("github.org.removeMemberDescription", { org: target.org })}
        confirmLabel={t("github.org.removeMemberConfirm")}
        destructive
        onConfirm={() => {
          if (removing) {
            void perform(() => removeMember(target.accountId, target.org, removing), () => i18next.t("github.org.memberRemoved", { login: removing }));
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

function InvitationsTab({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const invitations = useQuery({ queryKey: [...ROOT, target.org, "invitations"], queryFn: () => listInvitations(target.accountId, target.org), retry: false });
  const [who, setWho] = useState("");
  const [role, setRole] = useState<InviteRole>("direct_member");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canAdmin || busy || who.trim() === "") {
      return;
    }
    setBusy(true);
    const invited = await perform(() => inviteMember(target.accountId, target.org, who.trim(), role), () => i18next.t("github.org.invited", { who: who.trim() }));
    setBusy(false);
    if (invited) {
      setWho("");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2" aria-label={t("github.org.inviteTitle")}>
        <div className="min-w-48 flex-1">
          <TextField label={t("github.org.inviteWho")} hint={t("github.org.inviteHint")} value={who} disabled={!canAdmin || busy} onChange={(event) => setWho(event.target.value)} spellCheck={false} />
        </div>
        <div className="w-44">
          <SelectField label={t("github.org.inviteRole")} value={role} disabled={!canAdmin || busy} onChange={(event) => setRole(event.target.value as InviteRole)}>
            <option value="direct_member">{t("github.org.roles.member")}</option>
            <option value="admin">{t("github.org.roles.admin")}</option>
            <option value="billing_manager">{t("github.org.roles.billing")}</option>
          </SelectField>
        </div>
        <Button type="submit" variant="primary" icon={<UserPlus className="size-3.5" />} disabled={!canAdmin || who.trim() === ""} loading={busy}>
          {t("github.settings.collaborators.invite")}
        </Button>
      </form>
      {invitations.isPending ? (
        <Skeleton className="h-16" />
      ) : invitations.isError ? (
        <QueryError error={invitations.error} onRetry={() => void invitations.refetch()} />
      ) : invitations.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.org.noInvitations")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.org.tabs.invitations")}>
          {invitations.data.map((invitation) => (
            <li key={invitation.id} className="flex items-center gap-2.5 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {invitation.login ?? invitation.email}
                <span className="ml-2 text-xs text-muted">{invitation.role}</span>
              </span>
              <Button size="sm" disabled={!canAdmin} onClick={() => void perform(() => cancelOrgInvitation(target.accountId, target.org, invitation.id), () => i18next.t("github.org.invitationCancelled"))}>
                {t("github.settings.collaborators.cancelInvitation")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamMembers({ target, canAdmin, team }: Props & { team: Team }) {
  const { t } = useTranslation();
  const members = useQuery({
    queryKey: [...ROOT, target.org, "team-members", team.slug],
    queryFn: () => listTeamMembers(target.accountId, target.org, team.slug),
    retry: false,
  });
  const [login, setLogin] = useState("");

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-subtle/40 px-3 py-2">
      {members.isPending ? (
        <Skeleton className="h-10" />
      ) : members.isError ? (
        <QueryError error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="flex flex-col">
          {members.data.map((member) => (
            <PersonRow
              key={member.login}
              person={member}
              actions={
                <IconButton
                  label={t("github.org.removeFromTeam", { login: member.login, team: team.name })}
                  disabled={!canAdmin}
                  onClick={() => void perform(() => removeTeamMember(target.accountId, target.org, team.slug, member.login), () => i18next.t("github.org.teamMemberRemoved", { login: member.login }))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              }
            />
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canAdmin && login.trim() !== "") {
            void perform(() => addTeamMember(target.accountId, target.org, team.slug, login.trim()), () => i18next.t("github.org.teamMemberAdded", { login: login.trim() })).then((added) => {
              if (added) {
                setLogin("");
              }
            });
          }
        }}
      >
        <div className="flex-1">
          <TextField label={t("github.org.addToTeam", { team: team.name })} value={login} disabled={!canAdmin} onChange={(event) => setLogin(event.target.value)} spellCheck={false} />
        </div>
        <Button type="submit" size="sm" disabled={!canAdmin || login.trim() === ""}>
          {t("github.org.add")}
        </Button>
      </form>
    </div>
  );
}

function TeamsTab({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const teams = useQuery({ queryKey: [...ROOT, target.org, "teams"], queryFn: () => listTeams(target.accountId, target.org), retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [secret, setSecret] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      return;
    }
    const created = await perform(() => createTeam(target.accountId, target.org, name.trim(), description.trim(), secret), () => i18next.t("github.org.teamCreated", { name: name.trim() }));
    if (created) {
      setCreating(false);
      setName("");
      setDescription("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setCreating(true)}>
          {t("github.org.newTeam")}
        </Button>
      </div>
      {creating ? (
        <form onSubmit={(event) => void create(event)} className="flex flex-col gap-3 rounded-lg border border-line p-3" aria-label={t("github.org.newTeam")}>
          <TextField label={t("github.org.teamName")} value={name} onChange={(event) => setName(event.target.value)} />
          <TextField label={t("github.org.teamDescription")} value={description} onChange={(event) => setDescription(event.target.value)} />
          <ToggleRow label={t("github.org.teamSecret")} hint={t("github.org.teamSecretHint")} checked={secret} disabled={false} onChange={setSecret} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={name.trim() === ""}>
              {t("github.org.createTeam")}
            </Button>
            <Button onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : null}
      {teams.isPending ? (
        <Skeleton className="h-16" />
      ) : teams.isError ? (
        <QueryError error={teams.error} onRetry={() => void teams.refetch()} />
      ) : teams.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.org.noTeams")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.org.tabs.teams")}>
          {teams.data.map((team) => (
            <li key={team.slug}>
              <div className="flex items-center gap-2.5 px-3 py-2">
                <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] font-medium hover:underline" onClick={() => setOpen(open === team.slug ? null : team.slug)}>
                  {team.name}
                  <span className="ml-2 text-xs font-normal text-muted">{team.privacy === "secret" ? t("github.org.secret") : t("github.org.visible")}</span>
                </button>
                <IconButton label={t("github.org.deleteTeam", { name: team.name })} disabled={!canAdmin} onClick={() => setDeleting(team)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              {open === team.slug ? <TeamMembers target={target} canAdmin={canAdmin} team={team} /> : null}
            </li>
          ))}
        </ul>
      )}
      <TypedConfirmDialog
        open={deleting !== null}
        title={t("github.org.deleteTeamTitle", { name: deleting?.name ?? "" })}
        description={t("github.org.deleteTeamDescription")}
        consequences={[t("github.org.deleteTeamConsequence")]}
        expected={deleting?.slug ?? ""}
        confirmLabel={t("github.org.deleteTeam", { name: deleting?.name ?? "" })}
        onConfirm={() => {
          if (deleting) {
            void perform(() => deleteTeam(target.accountId, target.org, deleting.slug), () => i18next.t("github.org.teamDeleted", { name: deleting.name }));
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function OutsideTab({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const people = useQuery({ queryKey: [...ROOT, target.org, "outside"], queryFn: () => listOutsideCollaborators(target.accountId, target.org), retry: false });
  if (people.isPending) {
    return <Skeleton className="h-16" />;
  }
  if (people.isError) {
    return <QueryError error={people.error} onRetry={() => void people.refetch()} />;
  }
  if (people.data.length === 0) {
    return <p className="text-xs text-muted">{t("github.org.noOutside")}</p>;
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.org.tabs.outside")}>
      {people.data.map((person) => (
        <PersonRow
          key={person.login}
          person={person}
          actions={
            <IconButton
              label={t("github.org.removeOutside", { login: person.login })}
              disabled={!canAdmin}
              onClick={() => void perform(() => removeOutsideCollaborator(target.accountId, target.org, person.login), () => i18next.t("github.org.outsideRemoved", { login: person.login }))}
            >
              <Trash2 className="size-4" />
            </IconButton>
          }
        />
      ))}
    </ul>
  );
}

function OrgBody({ target }: { target: OrgTarget }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("members");
  const membership = useQuery({ queryKey: [...ROOT, target.org, "role"], queryFn: () => getMembership(target.accountId, target.org), retry: false });
  const canAdmin = membership.data?.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      {membership.isSuccess && !canAdmin ? (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning" role="status">
          {t("github.org.readOnly")}
        </p>
      ) : null}
      <div role="tablist" aria-label={t("github.org.tabsLabel")} className="inline-flex w-fit flex-wrap gap-1 rounded-lg bg-subtle p-1">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150",
              tab === item ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {t(`github.org.tabs.${item}`)}
          </button>
        ))}
      </div>
      {tab === "members" ? <MembersTab target={target} canAdmin={canAdmin} /> : null}
      {tab === "invitations" ? <InvitationsTab target={target} canAdmin={canAdmin} /> : null}
      {tab === "teams" ? <TeamsTab target={target} canAdmin={canAdmin} /> : null}
      {tab === "outside" ? <OutsideTab target={target} canAdmin={canAdmin} /> : null}
      {tab === "secrets" ? (
        <SecretsSection
          scope={{ accountId: target.accountId, owner: target.org, repo: "", org: target.org }}
          canAdmin={canAdmin}
          title={t("github.settings.sections.actions")}
        />
      ) : null}
    </div>
  );
}

export function OrgDialog() {
  const { t } = useTranslation();
  const target = useOrgDialogStore((state) => state.target);
  const hide = useOrgDialogStore((state) => state.hide);
  if (!target) {
    return null;
  }
  return (
    <Dialog
      open
      title={t("github.org.title", { org: target.org })}
      description={t("github.org.description")}
      onClose={hide}
      width="lg"
      footer={<Button onClick={hide}>{t("common.close")}</Button>}
    >
      <OrgBody key={`${target.accountId}|${target.org}`} target={target} />
    </Dialog>
  );
}
