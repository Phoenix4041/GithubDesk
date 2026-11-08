import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { GithubAccount } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { AccountDialog } from "./account-dialog";

const ACCOUNT: GithubAccount = {
  id: "github.com:octo",
  host: "github.com",
  login: "octo",
  name: "Octo",
  avatarUrl: "",
  source: "oauth",
  userId: 1,
};

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(options: { picked?: string[] } = {}): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    switch (command) {
      case "github_profile_get":
        return { login: "octo", name: "Octo", bio: "Hi", company: null, location: "Lima", blog: null };
      case "github_emails_list":
        return [
          { email: "octo@example.com", primary: true, verified: true, visibility: "private" },
          { email: "old@example.com", primary: false, verified: false, visibility: null },
        ];
      case "github_ssh_keys_list":
        return args.signing
          ? [{ id: 2, title: "Signing", key: "ssh-ed25519 SSSS", createdAt: "" }]
          : [{ id: 1, title: "Laptop", key: "ssh-ed25519 AAAA", createdAt: "" }];
      case "github_gpg_keys_list":
        return [{ id: 5, keyId: "3AA5C34371567BD2", name: null, emails: [{ email: "octo@example.com", verified: true }], canSign: true, expiresAt: null, createdAt: "" }];
      case "signing_keys_list":
        return { gpgAvailable: true, gpg: [{ keyId: "ABCD1234ABCD1234", fingerprint: null, user: "Octo <o@x.co>", created: null, expires: null, expired: false }], ssh: [] };
      case "signing_export_public_key":
        return "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nxyz\n-----END PGP PUBLIC KEY BLOCK-----";
      case "plugin:dialog|open":
        return options.picked ?? [];
      case "read_public_key_file":
        return "ssh-ed25519 FROMFILE comment";
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
  renderWithProviders(<AccountDialog account={ACCOUNT} onClose={() => undefined} />);
  if (tab) {
    fireEvent.click(screen.getByRole("tab", { name: t(tab) }));
  }
}

describe("AccountDialog", () => {
  it("edits the public profile and sends all five fields", async () => {
    const calls = serve();
    open();
    const name = await screen.findByLabelText<HTMLInputElement>(t("github.account.name"));
    expect(name.value).toBe("Octo");
    const save = screen.getByRole<HTMLButtonElement>("button", { name: t("github.settings.save") });
    expect(save.disabled).toBe(true);
    fireEvent.change(name, { target: { value: "Octo Cat" } });
    fireEvent.change(screen.getByLabelText(t("github.account.blog")), { target: { value: "https://octo.example" } });
    fireEvent.click(save);
    expect((await lastCall(calls, "github_profile_update")).update).toEqual({
      name: "Octo Cat",
      bio: "Hi",
      company: "",
      location: "Lima",
      blog: "https://octo.example",
    });
  });

  it("lists access keys and signing keys apart and adds a signing key", async () => {
    const calls = serve();
    open("github.account.tabs.ssh");
    expect(await screen.findByText("Laptop")).toBeTruthy();
    expect(await screen.findByText("Signing")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: t("github.account.addSsh") }));
    const dialog = await screen.findByRole("dialog", { name: t("github.account.addSsh") });
    const add = within(dialog).getByRole<HTMLButtonElement>("button", { name: t("github.settings.keys.add") });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.keys.titleLabel")), { target: { value: "Work laptop" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.keys.keyLabel")), { target: { value: "-----BEGIN OPENSSH PRIVATE KEY-----" } });
    expect(add.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.keys.keyLabel")), { target: { value: "ssh-ed25519 NEWKEY" } });
    fireEvent.click(within(dialog).getByLabelText(t("github.account.forSigning")));
    fireEvent.click(add);
    expect(await lastCall(calls, "github_ssh_key_add")).toMatchObject({ signing: true, title: "Work laptop", key: "ssh-ed25519 NEWKEY" });
  });

  it("fills the key and a title from a chosen .pub file", async () => {
    serve({ picked: ["C:/Users/octo/.ssh/id_ed25519.pub"] });
    open("github.account.tabs.ssh");
    fireEvent.click(await screen.findByRole("button", { name: t("github.account.addSsh") }));
    const dialog = await screen.findByRole("dialog", { name: t("github.account.addSsh") });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.account.chooseKeyFile") }));
    await waitFor(() => expect(within(dialog).getByLabelText<HTMLTextAreaElement>(t("github.settings.keys.keyLabel")).value).toBe("ssh-ed25519 FROMFILE comment"));
    expect(within(dialog).getByLabelText<HTMLInputElement>(t("github.settings.keys.titleLabel")).value).toBe("id_ed25519");
  });

  it("deletes a key after confirming", async () => {
    const calls = serve();
    open("github.account.tabs.ssh");
    fireEvent.click(await screen.findByRole("button", { name: t("github.account.removeKey", { title: "Laptop" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.keys.removeConfirm") }));
    expect(await lastCall(calls, "github_ssh_key_delete")).toMatchObject({ id: 1, signing: false });
  });

  it("exports a local GPG key and uploads it, and deletes an uploaded one", async () => {
    const calls = serve();
    open("github.account.tabs.gpg");
    expect(await screen.findByText("3AA5C34371567BD2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: t("github.account.addGpg") }));
    const dialog = await screen.findByRole("dialog", { name: t("github.account.addGpg") });
    const select = await within(dialog).findByLabelText<HTMLSelectElement>(t("github.account.localKey"));
    await waitFor(() => expect(within(select).getAllByRole("option").length).toBe(2));
    fireEvent.change(select, { target: { value: "ABCD1234ABCD1234" } });
    await waitFor(() => expect(within(dialog).getByLabelText<HTMLTextAreaElement>(t("github.account.armoredKey")).value).toContain("BEGIN PGP PUBLIC KEY BLOCK"));
    expect(await lastCall(calls, "signing_export_public_key")).toMatchObject({ keyId: "ABCD1234ABCD1234" });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.keys.add") }));
    expect(String((await lastCall(calls, "github_gpg_key_add")).armored)).toContain("END PGP PUBLIC KEY BLOCK");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: t("github.account.addGpg") })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: t("github.account.removeKey", { title: "3AA5C34371567BD2" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.keys.removeConfirm") }));
    expect(await lastCall(calls, "github_gpg_key_delete")).toMatchObject({ id: 5 });
  });

  it("shows which emails are primary and verified", async () => {
    serve();
    open("github.account.tabs.emails");
    expect(await screen.findByText("octo@example.com")).toBeTruthy();
    expect(screen.getByText(t("github.account.primary"))).toBeTruthy();
    expect(screen.getByText(t("github.account.verified"))).toBeTruthy();
    expect(screen.getByText(t("github.account.unverified"))).toBeTruthy();
  });
});
