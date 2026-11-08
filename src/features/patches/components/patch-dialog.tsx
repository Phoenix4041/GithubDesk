import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { splitPath } from "@/shared/lib/paths";
import { describeError } from "@/shared/lib/report-error";
import type { PatchApplyMode, PatchPreview } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { applyPatchFiles } from "../actions";
import { usePatchPreview } from "../queries";
import { usePatchDialogStore } from "../store";

const MODES: PatchApplyMode[] = ["commit", "workingTree"];

interface FormProps {
  repoPath: string;
  files: string[];
  onClose: () => void;
}

function PatchCard({ preview }: { preview: PatchPreview }) {
  const { t } = useTranslation();
  const added = preview.changes.reduce((total, change) => total + (change.insertions ?? 0), 0);
  const removed = preview.changes.reduce((total, change) => total + (change.deletions ?? 0), 0);
  const title = preview.subject ?? splitPath(preview.file).fileName;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-line px-3 py-2">
      <span className="truncate text-[13px] font-medium" title={preview.file}>
        {title}
      </span>
      {preview.author ? <span className="truncate text-[11px] text-muted">{preview.author}</span> : null}
      <span className="text-[11px] text-muted">
        {t("patches.dialog.filesCount", { count: preview.changes.length })}
        <span className="text-add"> +{added}</span>
        <span className="text-del"> -{removed}</span>
      </span>
      {preview.appliesCleanly ? (
        <span className="text-[11px] text-add">{t("patches.dialog.applies")}</span>
      ) : (
        <span className="text-[11px] text-warning">
          {t("patches.dialog.doesNotFit")}
          {preview.problem ? ` (${preview.problem})` : ""}
        </span>
      )}
    </li>
  );
}

function PatchForm({ repoPath, files, onClose }: FormProps) {
  const { t } = useTranslation();
  const preview = usePatchPreview(repoPath, files);
  const [chosenMode, setChosenMode] = useState<PatchApplyMode | null>(null);
  const [busy, setBusy] = useState(false);

  const data = preview.data;
  const allMailbox = data !== undefined && data.every((item) => item.mailbox);
  const mode: PatchApplyMode = chosenMode ?? (allMailbox ? "commit" : "workingTree");
  const blocked = !data || data.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || busy) {
      return;
    }
    setBusy(true);
    const result = await applyPatchFiles(repoPath, files, mode);
    setBusy(false);
    if (result !== "failed") {
      onClose();
    }
  }

  let summary;
  if (preview.isPending) {
    summary = <Skeleton className="h-20" />;
  } else if (preview.isError) {
    const description = describeError(preview.error);
    summary = <ErrorState title={description.title} message={description.message} onRetry={() => void preview.refetch()} />;
  } else {
    summary = (
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" aria-label={t("patches.dialog.filesLabel")}>
        {preview.data.map((item) => (
          <PatchCard key={item.file} preview={item} />
        ))}
      </ul>
    );
  }

  return (
    <Dialog
      open
      title={t("patches.dialog.title", { count: files.length })}
      description={t("patches.dialog.description")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="patch-form" disabled={blocked} loading={busy}>
            {t("patches.dialog.submit")}
          </Button>
        </>
      }
    >
      <form id="patch-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {summary}
        {data && !allMailbox ? (
          <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">{t("patches.dialog.needsMailbox")}</p>
        ) : null}
        <div role="radiogroup" aria-label={t("patches.dialog.modeLabel")} className="flex flex-col gap-1.5">
          {MODES.map((item) => {
            const disabled = item === "commit" && !allMailbox;
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={mode === item}
                disabled={disabled}
                onClick={() => setChosenMode(item)}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                  mode === item ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle",
                )}
              >
                <span className="text-[13px] font-medium">{t(`patches.dialog.modes.${item}.label`)}</span>
                <span className="text-xs text-muted">{t(`patches.dialog.modes.${item}.hint`)}</span>
              </button>
            );
          })}
        </div>
      </form>
    </Dialog>
  );
}

export function PatchDialog({ repoPath }: { repoPath: string }) {
  const files = usePatchDialogStore((state) => state.files);
  const hide = usePatchDialogStore((state) => state.hide);
  if (!files) {
    return null;
  }
  return <PatchForm key={files.join("|")} repoPath={repoPath} files={files} onClose={hide} />;
}
