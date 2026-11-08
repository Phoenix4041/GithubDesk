import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { SelectField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { saveSettings } from "../actions";
import { useBranches, useRepoSettings } from "../queries";
import { buildPatch, draftFrom, hasChanges, mergeMethodsValid, parseTopics } from "../settings-model";
import type { RepoSettings, RepoSettingsDraft } from "../settings-model";
import { QueryError, SectionFrame, ToggleRow } from "./section-frame";

interface FormProps {
  target: GithubTarget;
  settings: RepoSettings;
  canAdmin: boolean;
}

function GeneralForm({ target, settings, canAdmin }: FormProps) {
  const { t } = useTranslation();
  const branches = useBranches(target);
  const [edited, setEdited] = useState<RepoSettingsDraft | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = edited ?? draftFrom(settings);
  const changed = hasChanges(settings, draft);
  const mergeOk = mergeMethodsValid(draft);
  const disabled = !canAdmin || busy;
  const risky = (settings.private && !draft.private) || (!settings.archived && draft.archived);

  function patch(changes: Partial<RepoSettingsDraft>) {
    setEdited({ ...draft, ...changes });
  }

  async function save() {
    setBusy(true);
    const topics = parseTopics(draft.topicsText);
    const topicsDiffer = topics.join(",") !== settings.topics.join(",");
    const saved = await saveSettings(target, buildPatch(settings, draft), topicsDiffer ? topics : null);
    setBusy(false);
    setConfirming(false);
    if (saved) {
      setEdited(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!changed || !mergeOk || disabled) {
      return;
    }
    if (risky) {
      setConfirming(true);
    } else {
      void save();
    }
  }

  const branchNames = (branches.data ?? []).map((branch) => branch.name);
  if (!branchNames.includes(draft.defaultBranch)) {
    branchNames.unshift(draft.defaultBranch);
  }

  const consequences: string[] = [];
  if (settings.private && !draft.private) {
    consequences.push(t("github.settings.general.confirmPublic"));
  }
  if (!settings.archived && draft.archived) {
    consequences.push(t("github.settings.general.confirmArchive"));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <TextField
        label={t("github.settings.general.description")}
        value={draft.description}
        disabled={disabled}
        onChange={(event) => patch({ description: event.target.value })}
      />
      <TextField
        label={t("github.settings.general.homepage")}
        value={draft.homepage}
        placeholder="https://"
        disabled={disabled}
        onChange={(event) => patch({ homepage: event.target.value })}
        spellCheck={false}
      />
      <TextField
        label={t("github.settings.general.topics")}
        hint={t("github.settings.general.topicsHint")}
        value={draft.topicsText}
        disabled={disabled}
        onChange={(event) => patch({ topicsText: event.target.value })}
        spellCheck={false}
      />
      <SelectField
        label={t("github.settings.general.defaultBranch")}
        value={draft.defaultBranch}
        disabled={disabled}
        onChange={(event) => patch({ defaultBranch: event.target.value })}
      >
        {branchNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </SelectField>

      <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
        <legend className="mb-1 text-xs font-medium">{t("github.settings.general.features")}</legend>
        <ToggleRow label={t("github.settings.general.hasIssues")} checked={draft.hasIssues} disabled={disabled} onChange={(value) => patch({ hasIssues: value })} />
        <ToggleRow label={t("github.settings.general.hasWiki")} checked={draft.hasWiki} disabled={disabled} onChange={(value) => patch({ hasWiki: value })} />
        <ToggleRow label={t("github.settings.general.hasProjects")} checked={draft.hasProjects} disabled={disabled} onChange={(value) => patch({ hasProjects: value })} />
      </fieldset>

      <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
        <legend className="mb-1 text-xs font-medium">{t("github.settings.general.mergeOptions")}</legend>
        <ToggleRow label={t("github.settings.general.allowMergeCommit")} checked={draft.allowMergeCommit} disabled={disabled} onChange={(value) => patch({ allowMergeCommit: value })} />
        <ToggleRow label={t("github.settings.general.allowSquashMerge")} checked={draft.allowSquashMerge} disabled={disabled} onChange={(value) => patch({ allowSquashMerge: value })} />
        <ToggleRow label={t("github.settings.general.allowRebaseMerge")} checked={draft.allowRebaseMerge} disabled={disabled} onChange={(value) => patch({ allowRebaseMerge: value })} />
        <ToggleRow label={t("github.settings.general.allowAutoMerge")} checked={draft.allowAutoMerge} disabled={disabled} onChange={(value) => patch({ allowAutoMerge: value })} />
        <ToggleRow
          label={t("github.settings.general.deleteBranchOnMerge")}
          hint={t("github.settings.general.deleteBranchOnMergeHint")}
          checked={draft.deleteBranchOnMerge}
          disabled={disabled}
          onChange={(value) => patch({ deleteBranchOnMerge: value })}
        />
        {mergeOk ? null : <p className="text-xs text-danger">{t("github.settings.general.needOneMergeMethod")}</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
        <legend className="mb-1 text-xs font-medium">{t("github.settings.general.access")}</legend>
        <ToggleRow
          label={t("github.settings.general.private")}
          hint={t("github.settings.general.privateHint")}
          checked={draft.private}
          disabled={disabled}
          onChange={(value) => patch({ private: value })}
        />
        <ToggleRow
          label={t("github.settings.general.archived")}
          hint={t("github.settings.general.archivedHint")}
          checked={draft.archived}
          disabled={disabled}
          onChange={(value) => patch({ archived: value })}
        />
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!changed || !mergeOk || !canAdmin} loading={busy}>
          {t("github.settings.save")}
        </Button>
        {changed ? <Button onClick={() => setEdited(null)}>{t("github.settings.discard")}</Button> : null}
      </div>

      <ConfirmDialog
        open={confirming}
        title={t("github.settings.general.confirmTitle")}
        description={t("github.settings.general.confirmDescription", { name: settings.fullName })}
        consequences={consequences}
        confirmLabel={t("github.settings.save")}
        destructive
        loading={busy}
        onConfirm={() => void save()}
        onCancel={() => setConfirming(false)}
      />
    </form>
  );
}

export function GeneralSection({ target, canAdmin }: { target: GithubTarget; canAdmin: boolean }) {
  const { t } = useTranslation();
  const settings = useRepoSettings(target);
  return (
    <SectionFrame title={t("github.settings.sections.general")} description={t("github.settings.general.intro")}>
      {settings.isPending ? (
        <Skeleton className="h-48" />
      ) : settings.isError ? (
        <QueryError error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <GeneralForm key={settings.data.fullName + settings.dataUpdatedAt} target={target} settings={settings.data} canAdmin={canAdmin} />
      )}
    </SectionFrame>
  );
}
