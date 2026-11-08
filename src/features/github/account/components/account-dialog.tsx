import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAvailableKeys } from "@/features/profiles/queries";
import { cn } from "@/shared/lib/cn";
import { pickFiles } from "@/shared/lib/dialogs";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { splitPath } from "@/shared/lib/paths";
import type { GithubAccount } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField, TextAreaField, TextField } from "@/shared/ui/text-field";
import { showToast } from "@/shared/ui/toast-store";
import { i18next } from "@/i18n";
import { looksLikePublicKey } from "../../settings/settings-model";
import { QueryError, ToggleRow } from "../../settings/components/section-frame";
import {
  addGpgKey,
  addSshKey,
  deleteGpgKey,
  deleteSshKey,
  exportGpgPublicKey,
  getProfile,
  listEmails,
  listGpgKeys,
  listSshKeys,
  readPublicKeyFile,
  updateProfile,
} from "../api";
import type { ProfileUpdate } from "../api";
import { useQuery } from "@tanstack/react-query";

type Tab = "profile" | "ssh" | "gpg" | "emails";
const TABS: readonly Tab[] = ["profile", "ssh", "gpg", "emails"];
const ROOT = ["github", "account"] as const;

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

function ProfileTab({ account }: { account: GithubAccount }) {
  const { t } = useTranslation();
  const profile = useQuery({ queryKey: [...ROOT, account.id, "profile"], queryFn: () => getProfile(account.id), retry: false });
  const [edited, setEdited] = useState<ProfileUpdate | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile.isPending) {
    return <Skeleton className="h-40" />;
  }
  if (profile.isError) {
    return <QueryError error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  const original: ProfileUpdate = {
    name: profile.data.name ?? "",
    bio: profile.data.bio ?? "",
    company: profile.data.company ?? "",
    location: profile.data.location ?? "",
    blog: profile.data.blog ?? "",
  };
  const draft = edited ?? original;
  const changed = (Object.keys(original) as Array<keyof ProfileUpdate>).some((key) => draft[key].trim() !== original[key]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!changed || busy) {
      return;
    }
    setBusy(true);
    const saved = await perform(() => updateProfile(account.id, draft), () => i18next.t("github.account.profileSaved"));
    setBusy(false);
    if (saved) {
      setEdited(null);
    }
  }

  const field = (key: keyof ProfileUpdate, label: string, hint?: string) => (
    <TextField label={label} hint={hint} value={draft[key]} disabled={busy} onChange={(event) => setEdited({ ...draft, [key]: event.target.value })} />
  );

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
      {field("name", t("github.account.name"))}
      {field("bio", t("github.account.bio"), t("github.account.bioHint"))}
      {field("company", t("github.account.company"))}
      {field("location", t("github.account.location"))}
      {field("blog", t("github.account.blog"))}
      <div>
        <Button type="submit" variant="primary" disabled={!changed} loading={busy}>
          {t("github.settings.save")}
        </Button>
      </div>
    </form>
  );
}

function SshKeyDialog({ account, onClose }: { account: GithubAccount; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyOk = looksLikePublicKey(key);

  async function chooseFile() {
    const files = await pickFiles(t("github.account.chooseKeyFile"), [{ name: t("github.account.publicKeys"), extensions: ["pub"] }]);
    const file = files[0];
    if (!file) {
      return;
    }
    try {
      setKey(await readPublicKeyFile(file));
      setTitle((current) => (current === "" ? splitPath(file).fileName.replace(/\.pub$/, "") : current));
    } catch (error) {
      reportError(error);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!keyOk || title.trim() === "" || busy) {
      return;
    }
    setBusy(true);
    const added = await perform(() => addSshKey(account.id, signing, title.trim(), key.trim()), () => i18next.t("github.account.keyAdded"));
    setBusy(false);
    if (added) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("github.account.addSsh")}
      description={t("github.account.addSshDescription")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="account-ssh-form" disabled={!keyOk || title.trim() === ""} loading={busy}>
            {t("github.settings.keys.add")}
          </Button>
        </>
      }
    >
      <form id="account-ssh-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div>
          <Button icon={<FolderOpen className="size-3.5" />} onClick={() => void chooseFile()}>
            {t("github.account.chooseKeyFile")}
          </Button>
        </div>
        <TextField label={t("github.settings.keys.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <TextAreaField
          label={t("github.settings.keys.keyLabel")}
          error={key.trim() !== "" && !keyOk ? t("github.settings.keys.keyInvalid") : undefined}
          rows={4}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          spellCheck={false}
        />
        <ToggleRow label={t("github.account.forSigning")} hint={t("github.account.forSigningHint")} checked={signing} disabled={busy} onChange={setSigning} />
      </form>
    </Dialog>
  );
}

function SshTab({ account }: { account: GithubAccount }) {
  const { t } = useTranslation();
  const access = useQuery({ queryKey: [...ROOT, account.id, "ssh", false], queryFn: () => listSshKeys(account.id, false), retry: false });
  const signing = useQuery({ queryKey: [...ROOT, account.id, "ssh", true], queryFn: () => listSshKeys(account.id, true), retry: false });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; title: string; signing: boolean } | null>(null);

  const list = (title: string, query: typeof access, isSigning: boolean) => (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h4 className="text-xs font-semibold">{title}</h4>
      {query.isPending ? (
        <Skeleton className="h-12" />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.account.noKeys")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {query.data.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">{item.title}</span>
                <span className="selectable truncate font-mono text-[11px] text-muted">{item.key.slice(0, 48)}</span>
              </div>
              <IconButton label={t("github.account.removeKey", { title: item.title })} onClick={() => setRemoving({ id: item.id, title: item.title, signing: isSigning })}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
          {t("github.account.addSsh")}
        </Button>
      </div>
      {list(t("github.account.sshAccess"), access, false)}
      {list(t("github.account.sshSigning"), signing, true)}
      {adding ? <SshKeyDialog account={account} onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("github.account.removeKeyTitle", { title: removing?.title ?? "" })}
        description={t("github.account.removeKeyDescription")}
        confirmLabel={t("github.settings.keys.removeConfirm")}
        destructive
        onConfirm={() => {
          if (removing) {
            void perform(() => deleteSshKey(account.id, removing.signing, removing.id), () => i18next.t("github.account.keyRemoved"));
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function GpgDialog({ account, onClose }: { account: GithubAccount; onClose: () => void }) {
  const { t } = useTranslation();
  const keys = useAvailableKeys();
  const [armored, setArmored] = useState("");
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportChosen(keyId: string) {
    setChosen(keyId);
    if (keyId === "") {
      return;
    }
    try {
      setArmored(await exportGpgPublicKey(keyId));
    } catch (error) {
      reportError(error);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (armored.trim() === "" || busy) {
      return;
    }
    setBusy(true);
    const added = await perform(() => addGpgKey(account.id, "", armored), () => i18next.t("github.account.keyAdded"));
    setBusy(false);
    if (added) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("github.account.addGpg")}
      description={t("github.account.addGpgDescription")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="account-gpg-form" disabled={armored.trim() === ""} loading={busy}>
            {t("github.settings.keys.add")}
          </Button>
        </>
      }
    >
      <form id="account-gpg-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {(keys.data?.gpg.length ?? 0) > 0 ? (
          <SelectField label={t("github.account.localKey")} value={chosen} onChange={(event) => void exportChosen(event.target.value)}>
            <option value="">{t("github.account.pickLocal")}</option>
            {keys.data?.gpg.map((key) => (
              <option key={key.keyId} value={key.keyId}>
                {key.keyId}
                {key.user ? ` · ${key.user}` : ""}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextAreaField
          label={t("github.account.armoredKey")}
          hint={t("github.account.armoredHint")}
          rows={6}
          value={armored}
          onChange={(event) => setArmored(event.target.value)}
          spellCheck={false}
        />
      </form>
    </Dialog>
  );
}

function GpgTab({ account }: { account: GithubAccount }) {
  const { t } = useTranslation();
  const keys = useQuery({ queryKey: [...ROOT, account.id, "gpg"], queryFn: () => listGpgKeys(account.id), retry: false });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; keyId: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
          {t("github.account.addGpg")}
        </Button>
      </div>
      {keys.isPending ? (
        <Skeleton className="h-16" />
      ) : keys.isError ? (
        <QueryError error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.account.noKeys")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.account.tabs.gpg")}>
          {keys.data.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-[13px]">{item.keyId}</span>
                <span className="truncate text-[11px] text-muted">{item.emails.map((entry) => entry.email).join(", ")}</span>
              </div>
              <IconButton label={t("github.account.removeKey", { title: item.keyId })} onClick={() => setRemoving({ id: item.id, keyId: item.keyId })}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {adding ? <GpgDialog account={account} onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("github.account.removeKeyTitle", { title: removing?.keyId ?? "" })}
        description={t("github.account.removeKeyDescription")}
        confirmLabel={t("github.settings.keys.removeConfirm")}
        destructive
        onConfirm={() => {
          if (removing) {
            void perform(() => deleteGpgKey(account.id, removing.id), () => i18next.t("github.account.keyRemoved"));
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function EmailsTab({ account }: { account: GithubAccount }) {
  const { t } = useTranslation();
  const emails = useQuery({ queryKey: [...ROOT, account.id, "emails"], queryFn: () => listEmails(account.id), retry: false });
  if (emails.isPending) {
    return <Skeleton className="h-16" />;
  }
  if (emails.isError) {
    return <QueryError error={emails.error} onRetry={() => void emails.refetch()} />;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("github.account.emailsNote")}</p>
      <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.account.tabs.emails")}>
        {emails.data.map((entry) => (
          <li key={entry.email} className="flex items-center gap-2 px-3 py-2 text-[13px]">
            <span className="selectable min-w-0 flex-1 truncate">{entry.email}</span>
            {entry.primary ? <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] text-accent">{t("github.account.primary")}</span> : null}
            <span className={cn("rounded-full px-1.5 py-px text-[10px]", entry.verified ? "bg-add/15 text-add" : "bg-warning/15 text-warning")}>
              {entry.verified ? t("github.account.verified") : t("github.account.unverified")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountDialog({ account, onClose }: { account: GithubAccount; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <Dialog
      open
      title={t("github.account.title", { login: account.login })}
      description={t("github.account.description")}
      onClose={onClose}
      width="lg"
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}
    >
      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label={t("github.account.tabsLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
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
              {t(`github.account.tabs.${item}`)}
            </button>
          ))}
        </div>
        {tab === "profile" ? <ProfileTab account={account} /> : null}
        {tab === "ssh" ? <SshTab account={account} /> : null}
        {tab === "gpg" ? <GpgTab account={account} /> : null}
        {tab === "emails" ? <EmailsTab account={account} /> : null}
      </div>
    </Dialog>
  );
}
