import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField, TextAreaField, TextField } from "@/shared/ui/text-field";
import { addVariable, changeVariable, removeSecret, removeVariable, saveSecret } from "../secrets-actions";
import type { ActionsSecret, ActionsVariable, SecretsScope } from "../secrets-api";
import { nameProblem, shortValue, valueProblem } from "../secrets-model";
import type { Visibility } from "../secrets-model";
import { useSecrets, useVariables } from "../secrets-queries";
import { QueryError, SectionFrame } from "./section-frame";

interface Props {
  scope: SecretsScope;
  canAdmin: boolean;
  title: string;
}

type Editing =
  | { kind: "secret"; name: string | null }
  | { kind: "variable"; name: string | null; value: string }
  | null;

function ValueDialog({ scope, editing, onClose }: { scope: SecretsScope; editing: NonNullable<Editing>; onClose: () => void }) {
  const { t } = useTranslation();
  const isSecret = editing.kind === "secret";
  const updating = editing.name !== null;
  const [name, setName] = useState(editing.name ?? "");
  const [value, setValue] = useState(editing.kind === "variable" ? editing.value : "");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOrganization = scope.org !== null;
  const nameIssue = nameProblem(name);
  const valueIssue = valueProblem(value);
  const ready = nameIssue === null && valueIssue === null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    const level = isOrganization ? visibility : null;
    let saved: boolean;
    if (isSecret) {
      saved = await saveSecret(scope, name, value, level);
    } else if (updating) {
      saved = await changeVariable(scope, name, value);
    } else {
      saved = await addVariable(scope, name, value, level);
    }
    setBusy(false);
    if (saved) {
      onClose();
    }
  }

  const title = isSecret
    ? updating
      ? t("github.settings.secrets.updateSecretTitle", { name })
      : t("github.settings.secrets.newSecretTitle")
    : updating
      ? t("github.settings.secrets.updateVariableTitle", { name })
      : t("github.settings.secrets.newVariableTitle");

  return (
    <Dialog
      open
      title={title}
      description={isSecret ? t("github.settings.secrets.secretDescription") : undefined}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="secret-form" disabled={touched && !ready} loading={busy}>
            {t("github.settings.save")}
          </Button>
        </>
      }
    >
      <form id="secret-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus={!updating}
          label={t("github.settings.secrets.name")}
          value={name}
          readOnly={updating}
          error={touched && nameIssue ? t(`github.settings.secrets.nameProblems.${nameIssue}`) : undefined}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <TextAreaField
          data-autofocus={updating}
          label={t("github.settings.secrets.value")}
          hint={isSecret ? t("github.settings.secrets.valueHint") : undefined}
          error={touched && valueIssue ? t(`github.settings.secrets.valueProblems.${valueIssue}`) : undefined}
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className={isSecret ? "[-webkit-text-security:disc]" : undefined}
        />
        {isOrganization && !updating ? (
          <SelectField
            label={t("github.settings.secrets.visibility")}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value === "all" ? "all" : "private")}
          >
            <option value="private">{t("github.settings.secrets.visibilityPrivate")}</option>
            <option value="all">{t("github.settings.secrets.visibilityAll")}</option>
          </SelectField>
        ) : null}
      </form>
    </Dialog>
  );
}

function SecretRow({ scope, canAdmin, secret, onEdit }: { scope: SecretsScope; canAdmin: boolean; secret: ActionsSecret; onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const updated = isoToUnixSeconds(secret.updatedAt);

  async function remove() {
    setBusy(true);
    await removeSecret(scope, secret.name);
    setBusy(false);
    setRemoving(false);
  }

  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{secret.name}</span>
      {updated > 0 ? <span className="shrink-0 text-[11px] text-muted">{formatRelativeTime(updated, i18n.language)}</span> : null}
      <IconButton label={t("github.settings.secrets.replaceSecret", { name: secret.name })} disabled={!canAdmin} onClick={onEdit}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={t("github.settings.secrets.deleteSecret", { name: secret.name })} disabled={!canAdmin} onClick={() => setRemoving(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog
        open={removing}
        title={t("github.settings.secrets.deleteSecretTitle", { name: secret.name })}
        description={t("github.settings.secrets.deleteSecretDescription")}
        confirmLabel={t("github.settings.secrets.deleteConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </li>
  );
}

function VariableRow({
  scope,
  canAdmin,
  variable,
  onEdit,
}: {
  scope: SecretsScope;
  canAdmin: boolean;
  variable: ActionsVariable;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    await removeVariable(scope, variable.name);
    setBusy(false);
    setRemoving(false);
  }

  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className="shrink-0 font-mono text-xs">{variable.name}</span>
      <span className="selectable min-w-0 flex-1 truncate font-mono text-xs text-muted" title={variable.value}>
        {shortValue(variable.value)}
      </span>
      <IconButton label={t("github.settings.secrets.editVariable", { name: variable.name })} disabled={!canAdmin} onClick={onEdit}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={t("github.settings.secrets.deleteVariable", { name: variable.name })} disabled={!canAdmin} onClick={() => setRemoving(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog
        open={removing}
        title={t("github.settings.secrets.deleteVariableTitle", { name: variable.name })}
        description={t("github.settings.secrets.deleteVariableDescription")}
        confirmLabel={t("github.settings.secrets.deleteConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </li>
  );
}

export function SecretsSection({ scope, canAdmin, title }: Props) {
  const { t } = useTranslation();
  const secrets = useSecrets(scope);
  const variables = useVariables(scope);
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <SectionFrame title={title} description={t("github.settings.secrets.intro")}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">{t("github.settings.secrets.secrets")}</h4>
          <Button size="sm" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setEditing({ kind: "secret", name: null })}>
            {t("github.settings.secrets.newSecret")}
          </Button>
        </div>
        <p className="text-xs text-muted">{t("github.settings.secrets.neverShown")}</p>
        {secrets.isPending ? (
          <Skeleton className="h-14" />
        ) : secrets.isError ? (
          <QueryError error={secrets.error} onRetry={() => void secrets.refetch()} />
        ) : secrets.data.length === 0 ? (
          <p className="text-xs text-muted">{t("github.settings.secrets.noSecrets")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.secrets.secrets")}>
            {secrets.data.map((secret) => (
              <SecretRow
                key={secret.name}
                scope={scope}
                canAdmin={canAdmin}
                secret={secret}
                onEdit={() => setEditing({ kind: "secret", name: secret.name })}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">{t("github.settings.secrets.variables")}</h4>
          <Button size="sm" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setEditing({ kind: "variable", name: null, value: "" })}>
            {t("github.settings.secrets.newVariable")}
          </Button>
        </div>
        {variables.isPending ? (
          <Skeleton className="h-14" />
        ) : variables.isError ? (
          <QueryError error={variables.error} onRetry={() => void variables.refetch()} />
        ) : variables.data.length === 0 ? (
          <p className="text-xs text-muted">{t("github.settings.secrets.noVariables")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.secrets.variables")}>
            {variables.data.map((variable) => (
              <VariableRow
                key={variable.name}
                scope={scope}
                canAdmin={canAdmin}
                variable={variable}
                onEdit={() => setEditing({ kind: "variable", name: variable.name, value: variable.value })}
              />
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <ValueDialog key={`${editing.kind}:${editing.name ?? "new"}`} scope={scope} editing={editing} onClose={() => setEditing(null)} />
      ) : null}
    </SectionFrame>
  );
}
