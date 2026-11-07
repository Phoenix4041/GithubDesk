import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import { openNewIssue } from "../actions";
import { useAssignees, useLabels } from "../queries";

interface CreateIssueDialogProps {
  open: boolean;
  target: GithubTarget;
  onClose: () => void;
}

function toggled(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function CreateIssueForm({ target, onClose }: Omit<CreateIssueDialogProps, "open">) {
  const { t } = useTranslation();
  const labels = useLabels(target);
  const assignees = useAssignees(target, true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);
  const [chosenAssignees, setChosenAssignees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const canSubmit = title.trim().length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const created = await openNewIssue(target, {
      title: title.trim(),
      body,
      labels: chosenLabels,
      assignees: chosenAssignees,
    });
    setBusy(false);
    if (created) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("github.issues.create.title")}
      description={t("github.issues.create.description", { repo: `${target.owner}/${target.repo}` })}
      onClose={onClose}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-issue-form" disabled={!canSubmit} loading={busy}>
            {t("github.issues.create.submit")}
          </Button>
        </>
      }
    >
      <form id="create-issue-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <TextField data-autofocus label={t("github.issues.create.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <TextAreaField label={t("github.issues.create.body")} rows={6} value={body} onChange={(event) => setBody(event.target.value)} />
        {labels.data && labels.data.length > 0 ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium">{t("github.issues.create.labels")}</legend>
            <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
              {labels.data.map((label) => (
                <label key={label.name} className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={chosenLabels.includes(label.name)}
                    onChange={() => setChosenLabels((current) => toggled(current, label.name))}
                    className="size-3.5 cursor-pointer accent-accent"
                  />
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: `#${label.color}` }} />
                  {label.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {assignees.data && assignees.data.length > 0 ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium">{t("github.issues.create.assignees")}</legend>
            <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
              {assignees.data.map((user) => (
                <label key={user.login} className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={chosenAssignees.includes(user.login)}
                    onChange={() => setChosenAssignees((current) => toggled(current, user.login))}
                    className="size-3.5 cursor-pointer accent-accent"
                  />
                  {user.login}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </form>
    </Dialog>
  );
}

export function CreateIssueDialog({ open, target, onClose }: CreateIssueDialogProps) {
  if (!open) {
    return null;
  }
  return <CreateIssueForm target={target} onClose={onClose} />;
}
