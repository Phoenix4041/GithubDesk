import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { SecretsScope } from "../secrets-api";
import { SecretsSection } from "./secrets-section";

const REPO_SCOPE: SecretsScope = { accountId: "github.com:octo", owner: "acme", repo: "app", org: null };
const ORG_SCOPE: SecretsScope = { accountId: "github.com:octo", owner: "acme", repo: "app", org: "acme" };

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    if (command === "github_actions_secrets_list") {
      return [{ name: "API_TOKEN", createdAt: "", updatedAt: "2026-01-02T00:00:00Z", visibility: null }];
    }
    if (command === "github_actions_variables_list") {
      return [{ name: "REGION", value: "eu-west-1", createdAt: "", updatedAt: "", visibility: null }];
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

async function lastCall(calls: Calls, command: string): Promise<Record<string, unknown>> {
  await waitFor(() => expect(calls[command]?.length ?? 0).toBeGreaterThan(0));
  const list = calls[command] ?? [];
  return list[list.length - 1] ?? {};
}

function renderSection(scope: SecretsScope, canAdmin = true) {
  return renderWithProviders(<SecretsSection scope={scope} canAdmin={canAdmin} title="Secrets" />);
}

describe("SecretsSection", () => {
  it("lists secrets by name and variables with their value, and never asks for a secret value back", async () => {
    const calls = serve();
    renderSection(REPO_SCOPE);
    expect(await screen.findByText("API_TOKEN")).toBeTruthy();
    expect(screen.getByText("REGION")).toBeTruthy();
    expect(screen.getByText("eu-west-1")).toBeTruthy();
    expect(screen.getByText(t("github.settings.secrets.neverShown"))).toBeTruthy();
    expect(calls.github_actions_secrets_list?.[0]).toMatchObject({ owner: "acme", repo: "app", org: null });
  });

  it("creates a secret after validating the name and the value", async () => {
    const calls = serve();
    renderSection(REPO_SCOPE);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.newSecret") }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.name")), { target: { value: "GITHUB_TOKEN" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await within(dialog).findByText(t("github.settings.secrets.nameProblems.reserved"))).toBeTruthy();
    expect(within(dialog).getByText(t("github.settings.secrets.valueProblems.empty"))).toBeTruthy();
    expect(calls.github_actions_secret_put).toBeUndefined();

    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.name")), { target: { value: "DEPLOY_KEY" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.value")), { target: { value: "line one\nline two" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_actions_secret_put")).toMatchObject({
      name: "DEPLOY_KEY",
      value: "line one\nline two",
      visibility: null,
      org: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("replaces the value of an existing secret keeping its name fixed", async () => {
    const calls = serve();
    renderSection(REPO_SCOPE);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.replaceSecret", { name: "API_TOKEN" }) }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText<HTMLInputElement>(t("github.settings.secrets.name"));
    expect(name.value).toBe("API_TOKEN");
    expect(name.readOnly).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.value")), { target: { value: "new-value" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_actions_secret_put")).toMatchObject({ name: "API_TOKEN", value: "new-value" });
  });

  it("deletes a secret after confirming", async () => {
    const calls = serve();
    renderSection(REPO_SCOPE);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.deleteSecret", { name: "API_TOKEN" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.deleteConfirm") }));
    expect(await lastCall(calls, "github_actions_secret_delete")).toMatchObject({ name: "API_TOKEN" });
  });

  it("creates, edits and deletes variables", async () => {
    const calls = serve();
    renderSection(REPO_SCOPE);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.newVariable") }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.name")), { target: { value: "STAGE" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.value")), { target: { value: "prod" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_actions_variable_create")).toMatchObject({ name: "STAGE", value: "prod" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: t("github.settings.secrets.editVariable", { name: "REGION" }) }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText<HTMLTextAreaElement>(t("github.settings.secrets.value")).value).toBe("eu-west-1");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.value")), { target: { value: "us-east-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_actions_variable_update")).toMatchObject({ name: "REGION", value: "us-east-1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: t("github.settings.secrets.deleteVariable", { name: "REGION" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.deleteConfirm") }));
    expect(await lastCall(calls, "github_actions_variable_delete")).toMatchObject({ name: "REGION" });
  });

  it("asks who can use an organization secret", async () => {
    const calls = serve();
    renderSection(ORG_SCOPE);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.secrets.newSecret") }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.name")), { target: { value: "ORG_TOKEN" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.value")), { target: { value: "v" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.secrets.visibility")), { target: { value: "all" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_actions_secret_put")).toMatchObject({ org: "acme", visibility: "all" });
  });

  it("is read only without admin access", async () => {
    serve();
    renderSection(REPO_SCOPE, false);
    expect((await screen.findByRole<HTMLButtonElement>("button", { name: t("github.settings.secrets.newSecret") })).disabled).toBe(true);
    const remove = await screen.findByRole<HTMLButtonElement>("button", { name: t("github.settings.secrets.deleteSecret", { name: "API_TOKEN" }) });
    expect(remove.disabled).toBe(true);
  });
});
