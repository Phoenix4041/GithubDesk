import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useBranches } from "@/features/branches/queries";
import { useStatus } from "@/features/changes/queries";
import { useHistory } from "@/features/history/queries";
import { buildHistoryQuery, EMPTY_FILTER_FIELDS } from "@/features/history/history-query";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { openNewPull } from "../actions";
import { suggestPullTitle } from "../pull-model";
import { useRepoInfo } from "../queries";

interface CreatePullDialogProps {
  open: boolean;
  repoPath: string;
  target: GithubTarget;
  onClose: () => void;
}

const selectClasses =
  "h-8 w-full cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none";

function CreatePullForm({ open, repoPath, target, onClose }: CreatePullDialogProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const branches = useBranches(repoPath);
  const info = useRepoInfo(target);
  const history = useHistory(repoPath, buildHistoryQuery(EMPTY_FILTER_FIELDS, false), true);

  const currentBranch = status.data?.branch.head ?? "";
  const localNames = useMemo(
    () => (branches.data ?? []).filter((branch) => !branch.isRemote).map((branch) => branch.name),
    [branches.data],
  );
  const remoteNames = useMemo(
    () =>
      (branches.data ?? [])
        .filter((branch) => branch.isRemote && branch.remote === target.remoteName && !branch.name.endsWith("/HEAD"))
        .map((branch) => branch.name.slice(target.remoteName.length + 1)),
    [branches.data, target.remoteName],
  );

  const [head, setHead] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveHead = head ?? currentBranch;
  const effectiveBase = base ?? info.data?.defaultBranch ?? "";
  const lastSubject = history.data?.pages[0]?.[0]?.subject ?? null;
  const suggestedTitle = suggestPullTitle(effectiveHead, lastSubject, 2);
  const effectiveTitle = title ?? suggestedTitle;
  const published = remoteNames.includes(effectiveHead);
  const sameBranch = effectiveHead !== "" && effectiveHead === effectiveBase;
  const canSubmit = effectiveHead !== "" && effectiveBase !== "" && !sameBranch && effectiveTitle.trim().length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const created = await openNewPull(target, {
      title: effectiveTitle.trim(),
      body,
      head: effectiveHead,
      base: effectiveBase,
      draft,
    });
    setBusy(false);
    if (created) {
      onClose();
    }
  }

  const baseOptions = remoteNames.length > 0 ? remoteNames : localNames;

  return (
    <Dialog
      open={open}
      title={t("github.pulls.create.title")}
      description={t("github.pulls.create.description", { repo: `${target.owner}/${target.repo}` })}
      onClose={onClose}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-pull-form" disabled={!canSubmit} loading={busy}>
            {t("github.pulls.create.submit")}
          </Button>
        </>
      }
    >
      <form id="create-pull-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            {t("github.pulls.create.head")}
            <select value={effectiveHead} onChange={(event) => setHead(event.target.value)} className={selectClasses}>
              {localNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            {t("github.pulls.create.base")}
            <select value={effectiveBase} onChange={(event) => setBase(event.target.value)} className={selectClasses}>
              {baseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {sameBranch ? (
          <p role="alert" className="text-xs text-danger">
            {t("github.pulls.create.sameBranch")}
          </p>
        ) : null}
        {effectiveHead !== "" && !published && !sameBranch ? (
          <p role="status" className="text-xs text-warning">
            {t("github.pulls.create.notPublished", { branch: effectiveHead })}
          </p>
        ) : null}
        <TextField
          data-autofocus
          label={t("github.pulls.create.titleLabel")}
          value={effectiveTitle}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextAreaField
          label={t("github.pulls.create.body")}
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={draft}
            onChange={(event) => setDraft(event.target.checked)}
            className="size-3.5 cursor-pointer accent-accent"
          />
          {t("github.pulls.create.draft")}
        </label>
      </form>
    </Dialog>
  );
}

export function CreatePullDialog(props: CreatePullDialogProps) {
  if (!props.open) {
    return null;
  }
  return <CreatePullForm {...props} />;
}
