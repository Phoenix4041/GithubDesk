import { Undo2 } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { commitStagedChanges, undoHeadCommit } from "../actions";
import { useHeadCommit } from "../queries";
import { useChangesStore } from "../store";

const TITLE_SOFT_LIMIT = 72;

const fieldClasses =
  "w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-muted transition-colors duration-150 hover:border-muted/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

interface CommitBoxProps {
  repoPath: string;
  branchName: string | null;
  stagedCount: number;
  conflictCount: number;
}

export function CommitBox({ repoPath, branchName, stagedCount, conflictCount }: CommitBoxProps) {
  const { t } = useTranslation();
  const headCommit = useHeadCommit(repoPath);
  const head = headCommit.data ?? null;

  const draft = useChangesStore((state) => state.draft);
  const amend = useChangesStore((state) => state.amend);
  const setTitle = useChangesStore((state) => state.setTitle);
  const setDescription = useChangesStore((state) => state.setDescription);
  const setAmend = useChangesStore((state) => state.setAmend);
  const clearDraft = useChangesStore((state) => state.clearDraft);

  const [committing, setCommitting] = useState(false);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const titleLength = draft.title.trim().length;
  const hasConflicts = conflictCount > 0;
  const canCommit = titleLength > 0 && (stagedCount > 0 || amend) && !hasConflicts && !committing;

  async function submit() {
    if (!canCommit) {
      return;
    }
    setCommitting(true);
    const succeeded = await commitStagedChanges(repoPath, draft.title, draft.description, amend);
    setCommitting(false);
    if (succeeded) {
      clearDraft();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  async function confirmUndo() {
    setUndoing(true);
    const undone = await undoHeadCommit(repoPath);
    setUndoing(false);
    setConfirmingUndo(false);
    if (undone) {
      setTitle(undone.title);
      setDescription(undone.description);
    }
  }

  const undoConsequences = head?.pushed ? [t("commit.undo.pushedWarning")] : [];

  return (
    <section className="flex flex-col gap-2 border-t border-line bg-surface p-3" aria-label={t("commit.label")}>
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={draft.title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("commit.titlePlaceholder")}
          aria-label={t("commit.titleLabel")}
          className={cn(fieldClasses, "h-8")}
          spellCheck
        />
        {titleLength > TITLE_SOFT_LIMIT ? (
          <p className="text-[11px] text-warning" role="status">
            {t("commit.titleTooLong", { count: titleLength, limit: TITLE_SOFT_LIMIT })}
          </p>
        ) : null}
      </div>
      <textarea
        value={draft.description}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("commit.descriptionPlaceholder")}
        aria-label={t("commit.descriptionLabel")}
        rows={3}
        className={cn(fieldClasses, "resize-none py-1.5")}
        spellCheck
      />
      {head ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={amend}
            onChange={(event) => setAmend(event.target.checked, head)}
            className="size-3.5 cursor-pointer accent-accent"
          />
          {t("commit.amend")}
        </label>
      ) : null}
      {hasConflicts ? (
        <p className="text-xs text-danger" role="status">
          {t("commit.resolveConflictsFirst")}
        </p>
      ) : null}
      <Button variant="primary" onClick={() => void submit()} disabled={!canCommit} loading={committing}>
        {amend ? t("commit.submitAmend") : t("commit.submit", { branch: branchName ?? t("commit.currentBranch") })}
      </Button>
      {head ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2.5 py-1.5">
          <p className="min-w-0 truncate text-xs text-muted" title={head.title}>
            {t("commit.lastCommit")} <span className="font-medium text-fg">{head.title}</span>
          </p>
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => setConfirmingUndo(true)}>
            {t("commit.undo.action")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmingUndo}
        title={t("commit.undo.title")}
        description={t("commit.undo.description", { title: head?.title ?? "" })}
        consequences={undoConsequences}
        confirmLabel={t("commit.undo.confirm")}
        destructive={undoConsequences.length > 0}
        loading={undoing}
        onConfirm={() => void confirmUndo()}
        onCancel={() => setConfirmingUndo(false)}
      />
    </section>
  );
}
