import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import { useOrgDialogStore } from "../store";
import { OrgDialog } from "./org-dialog";

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(role = "admin"): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    switch (command) {
      case "github_org_membership":
        return { role, state: "active" };
      case "github_org_members":
        return args.role === "admin"
          ? [{ login: "boss", avatarUrl: "" }]
          : [
              { login: "boss", avatarUrl: "" },
              { login: "hubot", avatarUrl: "" },
            ];
      case "github_org_invitations":
        return [{ id: 9, login: "newbie", email: null, role: "direct_member", createdAt: "" }];
      case "github_org_teams":
        return [{ id: 1, slug: "core", name: "Core", description: null, privacy: "closed" }];
      case "github_org_team_members":
        return [{ login: "hubot", avatarUrl: "" }];
      case "github_org_outside_collaborators":
        return [{ login: "guest", avatarUrl: "" }];
      case "github_actions_secrets_list":
        return [{ name: "ORG_TOKEN", createdAt: "", updatedAt: "", visibility: "private" }];
      case "github_actions_variables_list":
        return [];
      default:
        return null;
    }
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

async function lastCall(calls: Calls, command: string): Promise<Record<string, unknown>> {
  await waitFor(() => expect(calls[command]?.length ?? 0).toBeGreaterThan(0));
  const list = calls[command] ?? [];
  return list[list.length - 1] ?? {};
}

function open(tab?: ParseKeys) {
  renderWithProviders(<OrgDialog />);
  act(() => useOrgDialogStore.getState().show({ accountId: "github.com:octo", org: "acme" }));
  if (tab) {
    fireEvent.click(screen.getByRole("tab", { name: t(tab) }));
  }
}

describe("OrgDialog", () => {
  afterEach(() => {
    act(() => useOrgDialogStore.getState().hide());
  });

  it("lists members with their role and lets an owner change it or remove them", async () => {
    const calls = serve();
    open();
    const role = await screen.findByLabelText<HTMLSelectElement>(t("github.org.roleOf", { login: "hubot" }));
    await waitFor(() => expect(role.disabled).toBe(false));
    expect(role.value).toBe("member");
    expect(screen.getByLabelText<HTMLSelectElement>(t("github.org.roleOf", { login: "boss" })).value).toBe("admin");

    fireEvent.change(role, { target: { value: "admin" } });
    expect(await lastCall(calls, "github_org_member_role")).toMatchObject({ org: "acme", login: "hubot", role: "admin" });

    fireEvent.click(screen.getByRole("button", { name: t("github.org.removeMember", { login: "hubot" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.org.removeMemberConfirm") }));
    expect(await lastCall(calls, "github_org_member_remove")).toMatchObject({ login: "hubot" });
  });

  it("is read only for people who are not owners", async () => {
    serve("member");
    open();
    expect(await screen.findByText(t("github.org.readOnly"))).toBeTruthy();
    expect((await screen.findByLabelText<HTMLSelectElement>(t("github.org.roleOf", { login: "hubot" }))).disabled).toBe(true);
  });

  it("invites by username with a role and cancels a pending invitation", async () => {
    const calls = serve();
    open("github.org.tabs.invitations");
    expect(await screen.findByText("newbie")).toBeTruthy();
    const invite = screen.getByRole<HTMLButtonElement>("button", { name: t("github.settings.collaborators.invite") });
    fireEvent.change(screen.getByLabelText(t("github.org.inviteWho")), { target: { value: "octocat" } });
    fireEvent.change(screen.getByLabelText(t("github.org.inviteRole")), { target: { value: "admin" } });
    await waitFor(() => expect(invite.disabled).toBe(false));
    fireEvent.click(invite);
    expect(await lastCall(calls, "github_org_invite")).toMatchObject({ org: "acme", who: "octocat", role: "admin" });

    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.collaborators.cancelInvitation") }));
    expect(await lastCall(calls, "github_org_invitation_cancel")).toMatchObject({ id: 9 });
  });

  it("creates a team, manages its members and deletes it with the typed name", async () => {
    const calls = serve();
    open("github.org.tabs.teams");
    expect(await screen.findByText("Core")).toBeTruthy();

    const newTeam = screen.getByRole<HTMLButtonElement>("button", { name: t("github.org.newTeam") });
    await waitFor(() => expect(newTeam.disabled).toBe(false));
    fireEvent.click(newTeam);
    fireEvent.change(await screen.findByLabelText(t("github.org.teamName")), { target: { value: "Docs" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.org.createTeam") }));
    expect(await lastCall(calls, "github_org_team_create")).toMatchObject({ name: "Docs", secret: false });

    fireEvent.click(screen.getByRole("button", { name: /^Core/ }));
    expect(await screen.findByLabelText(t("github.org.addToTeam", { team: "Core" }))).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t("github.org.addToTeam", { team: "Core" })), { target: { value: "octo" } });
    fireEvent.click(screen.getByRole("button", { name: t("github.org.add") }));
    expect(await lastCall(calls, "github_org_team_member_add")).toMatchObject({ slug: "core", login: "octo" });
    fireEvent.click(await screen.findByRole("button", { name: t("github.org.removeFromTeam", { login: "hubot", team: "Core" }) }));
    expect(await lastCall(calls, "github_org_team_member_remove")).toMatchObject({ slug: "core", login: "hubot" });

    fireEvent.click(screen.getByRole("button", { name: t("github.org.deleteTeam", { name: "Core" }) }));
    const dialog = await screen.findByRole("dialog", { name: t("github.org.deleteTeamTitle", { name: "Core" }) });
    const confirm = within(dialog).getByRole<HTMLButtonElement>("button", { name: t("github.org.deleteTeam", { name: "Core" }) });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(t("confirm.typeToConfirm", { value: "core" })), { target: { value: "core" } });
    fireEvent.click(confirm);
    expect(await lastCall(calls, "github_org_team_delete")).toMatchObject({ slug: "core" });
  });

  it("removes an outside collaborator and shows the organization secrets", async () => {
    const calls = serve();
    open("github.org.tabs.outside");
    const remove = await screen.findByRole<HTMLButtonElement>("button", { name: t("github.org.removeOutside", { login: "guest" }) });
    await waitFor(() => expect(remove.disabled).toBe(false));
    fireEvent.click(remove);
    expect(await lastCall(calls, "github_org_outside_collaborator_remove")).toMatchObject({ login: "guest" });

    fireEvent.click(screen.getByRole("tab", { name: t("github.org.tabs.secrets") }));
    expect(await screen.findByText("ORG_TOKEN")).toBeTruthy();
    expect(calls.github_actions_secrets_list?.[0]).toMatchObject({ org: "acme" });
  });
});
