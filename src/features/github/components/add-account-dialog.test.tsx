import { fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import type { GithubAccount } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import type { LoginOptions } from "../api";
import { AddAccountDialog } from "./add-account-dialog";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "system",
  userId: 1,
};

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(options: LoginOptions, failure?: string): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "github_login_options") {
      return options;
    }
    if (command === "github_login_system") {
      if (failure) {
        throw Object.assign(new Error(failure), { kind: "systemLoginUnavailable", suggestedAction: null, detail: "" });
      }
      return ACCOUNT;
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("AddAccountDialog", () => {
  beforeEach(() => {
    useSettingsStore.setState({ githubClientId: "" });
  });

  it("signs in with the system credential manager without asking for a client id", async () => {
    const calls = serve({ system: true, cli: false, embeddedClientId: null });
    let closed = 0;
    renderWithProviders(<AddAccountDialog open onClose={() => (closed += 1)} />);
    const signIn = await screen.findByRole<HTMLButtonElement>("button", { name: t("github.add.signIn") });
    await waitFor(() => expect(signIn.disabled).toBe(false));
    fireEvent.click(signIn);
    await waitFor(() => expect(calls.github_login_system?.[0]).toMatchObject({ host: "github.com", method: "system" }));
    await waitFor(() => expect(closed).toBe(1));
    expect(screen.queryByLabelText(t("github.add.clientId"))).toBeNull();
  });

  it("offers GitHub CLI only when it is installed and explains what is missing", async () => {
    const calls = serve({ system: false, cli: true, embeddedClientId: null });
    renderWithProviders(<AddAccountDialog open onClose={() => undefined} />);
    expect(await screen.findByText(t("github.add.noHelper"))).toBeTruthy();
    const signIn = screen.getByRole<HTMLButtonElement>("button", { name: t("github.add.signIn") });
    expect(signIn.disabled).toBe(true);
    const cli = screen.getByRole<HTMLButtonElement>("button", { name: t("github.add.useCli") });
    await waitFor(() => expect(cli.disabled).toBe(false));
    fireEvent.click(cli);
    await waitFor(() => expect(calls.github_login_system?.[0]).toMatchObject({ method: "cli" }));
  });

  it("points to the other ways when nothing is available", async () => {
    serve({ system: false, cli: false, embeddedClientId: null });
    renderWithProviders(<AddAccountDialog open onClose={() => undefined} />);
    expect(await screen.findByText(t("github.add.nothingAvailable"))).toBeTruthy();
  });

  it("keeps the dialog open when the sign-in fails", async () => {
    const calls = serve({ system: true, cli: false, embeddedClientId: null }, "no helper");
    let closed = 0;
    renderWithProviders(<AddAccountDialog open onClose={() => (closed += 1)} />);
    const signIn = await screen.findByRole<HTMLButtonElement>("button", { name: t("github.add.signIn") });
    await waitFor(() => expect(signIn.disabled).toBe(false));
    fireEvent.click(signIn);
    await waitFor(() => expect(calls.github_login_system?.length).toBe(1));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: t("github.add.signIn") }).disabled).toBe(false));
    expect(closed).toBe(0);
  });

  it("uses the client id shipped with the app when none was typed", async () => {
    const calls = serve({ system: false, cli: false, embeddedClientId: "Iv1.shipped" });
    calls.github_device_start = [];
    renderWithProviders(<AddAccountDialog open onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("tab", { name: t("github.add.methods.browser") }));
    expect(await screen.findByText(t("github.add.clientIdEmbedded"))).toBeTruthy();
    const start = screen.getByRole<HTMLButtonElement>("button", { name: t("github.add.start") });
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(calls.github_device_start?.length).toBe(1));
    expect(calls.github_device_start?.[0]).toMatchObject({ clientId: "Iv1.shipped" });
  });
});
