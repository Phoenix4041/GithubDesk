import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField, TextAreaField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { dropProtection, saveProtection } from "../actions";
import { useBranches, useProtection } from "../queries";
import { DEFAULT_PROTECTION, protectionDraftFrom, protectionFromDraft } from "../settings-model";
import type { ProtectionDraft, ProtectionSettings } from "../settings-model";
import { QueryError, SectionFrame, ToggleRow } from "./section-frame";

interface FormProps {
  target: GithubTarget;
  branch: string;
  rules: ProtectionSettings | null;
  canAdmin: boolean;
}

function ProtectionForm({ target, branch, rules, canAdmin }: FormProps) {
  const { t } = useTranslation();
  const [edited, setEdited] = useState<ProtectionDraft | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = edited ?? (rules ? protectionDraftFrom(rules) : DEFAULT_PROTECTION);
  const disabled = !canAdmin || busy;
  const protectedNow = rules !== null;
  const dirty = edited !== null || !protectedNow;

  function patch(changes: Partial<ProtectionDraft>) {
    setEdited({ ...draft, ...changes });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled) {
      return;
    }
    setBusy(true);
    const saved = await saveProtection(target, branch, protectionFromDraft(draft));
    setBusy(false);
    if (saved) {
      setEdited(null);
    }
  }

  async function remove() {
    setBusy(true);
    const dropped = await dropProtection(target, branch);
    setBusy(false);
    setRemoving(false);
    if (dropped) {
      setEdited(null);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
      <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted" role="status">
        {protectedNow ? t("github.settings.protection.protectedNow", { branch }) : t("github.settings.protection.notProtected", { branch })}
      </p>

      <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
        <legend className="mb-1 text-xs font-medium">{t("github.settings.protection.reviews")}</legend>
        <ToggleRow
          label={t("github.settings.protection.requireReviews")}
          checked={draft.requireReviews}
          disabled={disabled}
          onChange={(value) => patch({ requireReviews: value })}
        />
        {draft.requireReviews ? (
          <div className="ml-6 flex flex-col gap-2.5">
            <div className="w-40">
              <TextField
                type="number"
                min={1}
                max={6}
                label={t("github.settings.protection.reviewCount")}
                value={String(draft.reviewCount)}
                disabled={disabled}
                onChange={(event) => patch({ reviewCount: Number(event.target.value) })}
              />
            </div>
            <ToggleRow
              label={t("github.settings.protection.dismissStale")}
              checked={draft.dismissStaleReviews}
              disabled={disabled}
              onChange={(value) => patch({ dismissStaleReviews: value })}
            />
            <ToggleRow
              label={t("github.settings.protection.codeOwners")}
              checked={draft.requireCodeOwnerReviews}
              disabled={disabled}
              onChange={(value) => patch({ requireCodeOwnerReviews: value })}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
        <legend className="mb-1 text-xs font-medium">{t("github.settings.protection.checks")}</legend>
        <ToggleRow
          label={t("github.settings.protection.requireChecks")}
          checked={draft.requireChecks}
          disabled={disabled}
          onChange={(value) => patch({ requireChecks: value })}
        />
        {draft.requireChecks ? (
          <div className="ml-6 flex flex-col gap-2.5">
            <TextAreaField
              label={t("github.settings.protection.checkNames")}
              hint={t("github.settings.protection.checkNamesHint")}
              rows={3}
              value={draft.checksText}
              disabled={disabled}
              onChange={(event) => patch({ checksText: event.target.value })}
              spellCheck={false}
            />
            <ToggleRow
              label={t("github.settings.protection.strict")}
              checked={draft.strictChecks}
              disabled={disabled}
              onChange={(value) => patch({ strictChecks: value })}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
        <legend className="mb-1 text-xs font-medium">{t("github.settings.protection.rules")}</legend>
        <ToggleRow label={t("github.settings.protection.conversations")} checked={draft.requireConversationResolution} disabled={disabled} onChange={(value) => patch({ requireConversationResolution: value })} />
        <ToggleRow label={t("github.settings.protection.linear")} checked={draft.requireLinearHistory} disabled={disabled} onChange={(value) => patch({ requireLinearHistory: value })} />
        <ToggleRow label={t("github.settings.protection.enforceAdmins")} hint={t("github.settings.protection.enforceAdminsHint")} checked={draft.enforceAdmins} disabled={disabled} onChange={(value) => patch({ enforceAdmins: value })} />
        <ToggleRow label={t("github.settings.protection.allowForce")} checked={draft.allowForcePushes} disabled={disabled} onChange={(value) => patch({ allowForcePushes: value })} />
        <ToggleRow label={t("github.settings.protection.allowDelete")} checked={draft.allowDeletions} disabled={disabled} onChange={(value) => patch({ allowDeletions: value })} />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!canAdmin || !dirty} loading={busy}>
          {protectedNow ? t("github.settings.save") : t("github.settings.protection.protect")}
        </Button>
        {edited ? <Button onClick={() => setEdited(null)}>{t("github.settings.discard")}</Button> : null}
        {protectedNow ? (
          <Button variant="danger" disabled={!canAdmin || busy} onClick={() => setRemoving(true)}>
            {t("github.settings.protection.remove")}
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={removing}
        title={t("github.settings.protection.removeTitle", { branch })}
        description={t("github.settings.protection.removeDescription")}
        confirmLabel={t("github.settings.protection.remove")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </form>
  );
}

export function ProtectionSection({ target, canAdmin }: { target: GithubTarget; canAdmin: boolean }) {
  const { t } = useTranslation();
  const branches = useBranches(target);
  const [chosen, setChosen] = useState<string | null>(null);
  const list = branches.data ?? [];
  const branch = chosen ?? list.find((entry) => entry.protected)?.name ?? list[0]?.name ?? null;
  const protection = useProtection(target, branch);

  return (
    <SectionFrame title={t("github.settings.sections.protection")} description={t("github.settings.protection.intro")}>
      {branches.isPending ? (
        <Skeleton className="h-10" />
      ) : branches.isError ? (
        <QueryError error={branches.error} onRetry={() => void branches.refetch()} />
      ) : (
        <>
          <SelectField label={t("github.settings.protection.branch")} value={branch ?? ""} onChange={(event) => setChosen(event.target.value)}>
            {list.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.protected ? `${entry.name} (${t("github.settings.protection.protectedTag")})` : entry.name}
              </option>
            ))}
          </SelectField>
          {branch === null ? (
            <p className="text-xs text-muted">{t("github.settings.protection.noBranches")}</p>
          ) : protection.isPending ? (
            <Skeleton className="h-40" />
          ) : protection.isError ? (
            <QueryError error={protection.error} onRetry={() => void protection.refetch()} />
          ) : (
            <ProtectionForm key={branch + protection.dataUpdatedAt} target={target} branch={branch} rules={protection.data} canAdmin={canAdmin} />
          )}
        </>
      )}
    </SectionFrame>
  );
}
