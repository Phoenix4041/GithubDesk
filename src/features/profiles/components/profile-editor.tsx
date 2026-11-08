import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useOrgs } from "@/features/github/orgs/queries";
import { useAccounts } from "@/features/github/queries";
import { useGrantScopesStore } from "@/shared/lib/grant-scopes-store";
import { describeError } from "@/shared/lib/report-error";
import type { GithubAccount, SigningFormat, SigningKeys } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { SelectField, TextField } from "@/shared/ui/text-field";
import {
  defaultDraft,
  hasErrors,
  noreplyEmail,
  normalizeDraft,
  validateProfile,
} from "../profile-model";
import type { Profile, ProfileDraft } from "../profile-model";
import { useAvailableKeys } from "../queries";

interface ProfileEditorProps {
  initial: Profile | null;
  onSave: (draft: ProfileDraft) => void;
  onCancel: () => void;
}

interface KeyOption {
  value: string;
  label: string;
  key: string;
  format: SigningFormat;
}

function keyOptions(keys: SigningKeys | undefined): KeyOption[] {
  if (!keys) {
    return [];
  }
  const gpg = keys.gpg.map((key) => ({
    value: `openpgp:${key.keyId}`,
    label: `GPG ${key.keyId}${key.user ? ` · ${key.user}` : ""}`,
    key: key.keyId,
    format: "openpgp" as const,
  }));
  const ssh = keys.ssh.map((key) => ({
    value: `ssh:${key.path}`,
    label: `SSH ${key.kind}${key.comment ? ` · ${key.comment}` : ""}`,
    key: key.path,
    format: "ssh" as const,
  }));
  return [...gpg, ...ssh];
}

function blankDraft(accounts: readonly GithubAccount[]): ProfileDraft {
  const first = accounts[0];
  if (!first) {
    return { label: "", accountId: "", org: null, name: "", email: "", signingKey: null, signingFormat: "openpgp" };
  }
  return defaultDraft(first, null);
}

export function ProfileEditor({ initial, onSave, onCancel }: ProfileEditorProps) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const accountList = accounts.data ?? [];
  const [draft, setDraft] = useState<ProfileDraft>(initial ?? blankDraft(accountList));
  const [touched, setTouched] = useState(false);
  const orgs = useOrgs(draft.accountId === "" ? null : draft.accountId);
  const keys = useAvailableKeys();
  const grantScopes = useGrantScopesStore((state) => state.show);

  const account = accountList.find((candidate) => candidate.id === draft.accountId) ?? null;
  const errors = validateProfile(draft);
  const options = keyOptions(keys.data);
  const selectedKey = options.find((option) => option.key === draft.signingKey && option.format === draft.signingFormat);

  function patch(changes: Partial<ProfileDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function chooseAccount(accountId: string) {
    const next = accountList.find((candidate) => candidate.id === accountId);
    if (!next) {
      return;
    }
    patch({ accountId, org: null, name: draft.name || (next.name ?? next.login), email: draft.email || noreplyEmail(next) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) {
      return;
    }
    onSave(normalizeDraft(draft));
  }

  const errorText = (field: "label" | "name" | "email") => {
    const code = errors[field];
    return touched && code ? t(`profiles.editor.errors.${code}`) : undefined;
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t("profiles.editor.title")}>
      <TextField
        label={t("profiles.editor.label")}
        hint={t("profiles.editor.labelHint")}
        value={draft.label}
        error={errorText("label")}
        onChange={(event) => patch({ label: event.target.value })}
      />
      {accountList.length === 0 ? (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">{t("profiles.editor.noAccounts")}</p>
      ) : (
        <>
          <SelectField
            label={t("profiles.editor.account")}
            value={draft.accountId}
            onChange={(event) => chooseAccount(event.target.value)}
          >
            {accountList.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.login} · {candidate.host}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("profiles.editor.context")}
            value={draft.org ?? ""}
            onChange={(event) => patch({ org: event.target.value === "" ? null : event.target.value })}
            hint={orgs.isPending ? t("profiles.editor.orgsLoading") : undefined}
          >
            <option value="">{t("profiles.editor.contextPersonal", { login: account?.login ?? "" })}</option>
            {(orgs.data ?? []).map((org) => (
              <option key={org.login} value={org.login}>
                {org.login}
              </option>
            ))}
            {draft.org !== null && !(orgs.data ?? []).some((org) => org.login === draft.org) ? (
              <option value={draft.org}>{draft.org}</option>
            ) : null}
          </SelectField>
          {orgs.isError ? (
            <div className="flex flex-col gap-2 rounded-md bg-subtle px-3 py-2 text-xs text-muted" role="status">
              <p>
                {t("profiles.editor.orgsUnavailable")} {describeError(orgs.error).message}
              </p>
              <div>
                <Button size="sm" onClick={() => grantScopes({ accountId: draft.accountId, capabilityIds: ["orgRead"] })}>
                  {t("github.scopes.grant")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
      <TextField
        label={t("profiles.editor.name")}
        value={draft.name}
        error={errorText("name")}
        onChange={(event) => patch({ name: event.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          label={t("profiles.editor.email")}
          value={draft.email}
          error={errorText("email")}
          onChange={(event) => patch({ email: event.target.value })}
          spellCheck={false}
        />
        {account ? (
          <div>
            <Button size="sm" onClick={() => patch({ email: noreplyEmail(account) })}>
              {t("profiles.editor.useNoreply")}
            </Button>
          </div>
        ) : null}
      </div>
      <SelectField
        label={t("profiles.editor.signing")}
        value={selectedKey?.value ?? ""}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          patch(chosen ? { signingKey: chosen.key, signingFormat: chosen.format } : { signingKey: null });
        }}
        hint={keys.isError ? t("profiles.editor.signingUnavailable") : undefined}
      >
        <option value="">{t("profiles.editor.signingNone")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={accountList.length === 0}>
          {t("profiles.editor.save")}
        </Button>
      </div>
    </form>
  );
}
