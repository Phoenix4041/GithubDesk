import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useBranches } from "@/features/branches/queries";
import { useStatus } from "@/features/changes/queries";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { MergeMode } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { mergeBranch } from "../actions";
import { useMergePreview } from "../queries";
import { useMergeDialogStore } from "../store";

const MODES: MergeMode[] = ["merge", "noFastForward", "squash"];

interface FormProps {
  repoPath: string;
  source: string;
  onClose: () => void;
}

function MergeForm({ repoPath, source, onClose }: FormProps) {
  const { t } = useTranslation();
  const preview = useMergePreview(repoPath, source);
  const status = useStatus(repoPath);
  const current = status.data?.branch.head ?? "";
  const [mode, setMode] = useState<MergeMode>("merge");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const data = preview.data;
  const blocked = !data || data.upToDate || data.unrelated;
  const willCommit = mode === "noFastForward" || (mode === "merge" && data !== undefined && !data.canFastForward);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || busy) {
      return;
    }
    setBusy(true);
    const result = await mergeBranch(repoPath, source, mode, willCommit ? message : "");
    setBusy(false);
    if (result !== "failed") {
      onClose();
    }
  }

  let summary;
  if (preview.isPending) {
    summary = <Skeleton className="h-16" />;
  } else if (preview.isError) {
    const description = describeError(preview.error);
    summary = <ErrorState title={description.title} message={description.message} onRetry={() => void preview.refetch()} />;
  } else if (preview.data.unrelated) {
    summary = <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">{t("merge.unrelated")}</p>;
  } else if (preview.data.upToDate) {
    summary = <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted">{t("merge.upToDate", { source })}</p>;
  } else {
    summary = (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          {t("merge.summary", {
            commits: t("merge.commitsCount", { count: preview.data.commits }),
            files: t("merge.filesCount", { count: preview.data.filesChanged }),
          })}
          {preview.data.canFastForward ? ` ${t("merge.canFastForward")}` : ""}
        </p>
        {preview.data.conflicts.length > 0 ? (
          <div className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning" role="status">
            <p className="font-medium">{t("merge.conflictsExpected", { count: preview.data.conflicts.length })}</p>
            <ul className="mt-1 max-h-20 overflow-y-auto font-mono text-[11px]">
              {preview.data.conflicts.map((path) => (
                <li key={path} className="truncate">
                  {path}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-add">{t("merge.noConflicts")}</p>
        )}
      </div>
    );
  }

  return (
    <Dialog
      open
      title={t("merge.title", { source, current })}
      description={t("merge.description")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="merge-form" disabled={blocked} loading={busy}>
            {mode === "squash" ? t("merge.submitSquash") : t("merge.submit")}
          </Button>
        </>
      }
    >
      <form id="merge-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {summary}
        <div role="radiogroup" aria-label={t("merge.modeLabel")} className="flex flex-col gap-1.5">
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-150",
                mode === item ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle",
              )}
            >
              <span className="text-[13px] font-medium">{t(`merge.modes.${item}.label`)}</span>
              <span className="text-xs text-muted">{t(`merge.modes.${item}.hint`)}</span>
            </button>
          ))}
        </div>
        {willCommit ? (
          <TextField
            label={t("merge.message")}
            placeholder={t("merge.messagePlaceholder", { source, current })}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        ) : null}
      </form>
    </Dialog>
  );
}

function MergeChooser({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const branches = useBranches(repoPath);
  const show = useMergeDialogStore((state) => state.show);
  const [chosen, setChosen] = useState("");
  const candidates = (branches.data ?? []).filter((branch) => !branch.isCurrent);
  const selected = chosen !== "" ? chosen : (candidates[0]?.name ?? "");

  return (
    <Dialog
      open
      title={t("merge.choose.title")}
      description={t("merge.choose.description")}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={selected === ""} onClick={() => show(selected)}>
            {t("merge.choose.next")}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-xs text-muted">{t("merge.choose.none")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="merge-source" className="text-xs font-medium">
            {t("merge.choose.label")}
          </label>
          <select
            id="merge-source"
            data-autofocus
            value={selected}
            onChange={(event) => setChosen(event.target.value)}
            className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
          >
            {candidates.map((branch) => (
              <option key={branch.fullName} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Dialog>
  );
}

export function MergeDialog({ repoPath }: { repoPath: string }) {
  const source = useMergeDialogStore((state) => state.source);
  const choosing = useMergeDialogStore((state) => state.choosing);
  const hide = useMergeDialogStore((state) => state.hide);
  if (source) {
    return <MergeForm key={source} repoPath={repoPath} source={source} onClose={hide} />;
  }
  return choosing ? <MergeChooser repoPath={repoPath} onClose={hide} /> : null;
}
