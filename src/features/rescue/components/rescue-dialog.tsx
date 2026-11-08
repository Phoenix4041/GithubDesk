import { GitBranchPlus, History, LifeBuoy, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useReflogDialogStore } from "@/features/reflog/store";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { applyRescue, createBranchFromRescue, removeRescue } from "../actions";
import type { RescueEntry } from "../api";
import { useRescueDetail, useRescueList } from "../queries";
import { useRescueDialogStore } from "../store";
import { reasonLabel } from "../use-rescue-notice";

function Detail({ repoPath, entry, onDone }: { repoPath: string; entry: RescueEntry; onDone: () => void }) {
  const { t } = useTranslation();
  const detail = useRescueDetail(repoPath, entry.id);
  const [branchName, setBranchName] = useState("");
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    await applyRescue(repoPath, entry.id);
    setBusy(false);
  }

  async function makeBranch() {
    setBusy(true);
    const created = await createBranchFromRescue(repoPath, entry.id, branchName.trim());
    setBusy(false);
    if (created) {
      setBranchName("");
      onDone();
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line p-3" aria-label={t("rescue.detail")}>
      {detail.isPending ? (
        <Skeleton className="h-24" />
      ) : detail.isError ? (
        <p className="text-xs text-danger">{describeError(detail.error).message}</p>
      ) : (
        <>
          <ul className="flex max-h-24 flex-col overflow-y-auto text-xs">
            {detail.data.files.map((file) => (
              <li key={file.path} className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate font-mono">{file.path}</span>
                <span className="shrink-0 text-muted">
                  {file.additions === null ? t("rescue.binary") : `+${file.additions} -${file.deletions ?? 0}`}
                </span>
              </li>
            ))}
          </ul>
          <pre className="selectable max-h-44 overflow-auto rounded-md bg-canvas p-2 font-mono text-[11px] leading-4" tabIndex={0}>
            {detail.data.patch || t("rescue.noPatch")}
          </pre>
          {detail.data.truncated ? <p className="text-[11px] text-muted">{t("rescue.truncated")}</p> : null}
        </>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {entry.kind === "snapshot" ? (
          <Button size="sm" variant="primary" icon={<RotateCcw className="size-3.5" />} loading={busy} onClick={() => void apply()}>
            {t("rescue.apply")}
          </Button>
        ) : null}
        <div className="flex items-end gap-1.5">
          <TextField
            label={t("rescue.branchName")}
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            spellCheck={false}
            className="w-44"
          />
          <Button size="sm" icon={<GitBranchPlus className="size-3.5" />} disabled={branchName.trim().length === 0 || busy} onClick={() => void makeBranch()}>
            {t("rescue.createBranch")}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted">{t(entry.kind === "snapshot" ? "rescue.applyHint" : "rescue.branchHint")}</p>
    </section>
  );
}

function RescueBody({ repoPath }: { repoPath: string }) {
  const { t, i18n } = useTranslation();
  const list = useRescueList(repoPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (list.isPending) {
    return <Skeleton className="h-40" />;
  }
  if (list.isError) {
    const description = describeError(list.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void list.refetch()} />;
  }
  if (list.data.length === 0) {
    return <EmptyState icon={<LifeBuoy className="size-5" />} title={t("rescue.empty.title")} description={t("rescue.empty.description")} />;
  }
  const selected = list.data.find((entry) => entry.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("rescue.listLabel")}>
        {list.data.map((entry) => (
          <li key={entry.id} className="group flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0 hover:bg-subtle">
            <button type="button" className="flex min-w-0 flex-1 cursor-pointer flex-col text-left" onClick={() => setSelectedId(entry.id)} aria-pressed={entry.id === selectedId}>
              <span className="truncate text-[13px] font-medium">
                {reasonLabel(entry.reason)}
                {entry.label ? ` · ${entry.label}` : ""}
              </span>
              <span className="text-[11px] text-muted">
                {formatRelativeTime(entry.createdAt, i18n.language)} &middot; {t("rescue.summary", { count: entry.files, additions: entry.additions, deletions: entry.deletions })}
              </span>
            </button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              aria-label={t("rescue.delete", { reason: reasonLabel(entry.reason) })}
              onClick={() => {
                if (selectedId === entry.id) {
                  setSelectedId(null);
                }
                void removeRescue(repoPath, entry.id);
              }}
            >
              {t("rescue.deleteShort")}
            </Button>
          </li>
        ))}
      </ul>
      {selected ? <Detail key={selected.id} repoPath={repoPath} entry={selected} onDone={() => setSelectedId(null)} /> : <p className="text-xs text-muted">{t("rescue.pick")}</p>}
    </div>
  );
}

export function RescueDialog({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const open = useRescueDialogStore((state) => state.open);
  const hide = useRescueDialogStore((state) => state.hide);
  const showTimeline = useReflogDialogStore((state) => state.show);

  if (!open) {
    return null;
  }
  return (
    <Dialog
      open
      title={t("rescue.title")}
      description={t("rescue.description")}
      onClose={hide}
      width="lg"
      footer={
        <>
          <Button
            icon={<History className="size-3.5" />}
            onClick={() => {
              hide();
              showTimeline({ kind: "list" });
            }}
          >
            {t("rescue.timeline")}
          </Button>
          <Button onClick={hide}>{t("common.close")}</Button>
        </>
      }
    >
      <RescueBody repoPath={repoPath} />
    </Dialog>
  );
}
