import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { cleanRepository } from "../actions";
import { useCleanupPreview, useStaleRemoteBranches } from "../queries";
import { useCleanupDialogStore } from "../store";

interface Row {
  key: string;
  label: string;
  detail?: string;
}

interface SectionProps {
  title: string;
  description: string;
  rows: Row[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  footer?: ReactNode;
}

function Section({ title, description, rows, selected, onToggle, onToggleAll, footer }: SectionProps) {
  const { t } = useTranslation();
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.key));

  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">
          {title} <span className="font-normal text-muted">({rows.length})</span>
        </h3>
        {rows.length > 0 ? (
          <button
            type="button"
            onClick={onToggleAll}
            className="cursor-pointer text-[11px] text-accent hover:underline"
          >
            {allSelected ? t("cleanup.selectNone") : t("cleanup.selectAll")}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">{description}</p>
      {rows.length > 0 ? (
        <ul className="flex max-h-32 flex-col overflow-y-auto rounded-md border border-line">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-subtle">
              <Checkbox label={row.label} checked={selected.has(row.key)} onChange={() => onToggle(row.key)} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={row.label}>
                {row.label}
              </span>
              {row.detail ? <span className="shrink-0 text-[11px] text-muted">{row.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        footer ?? <p className="text-xs text-muted">{t("cleanup.nothingHere")}</p>
      )}
    </section>
  );
}

function toggled(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

function toggledAll(current: ReadonlySet<string>, keys: string[]): Set<string> {
  const every = keys.every((key) => current.has(key));
  const next = new Set(current);
  for (const key of keys) {
    if (every) {
      next.delete(key);
    } else {
      next.add(key);
    }
  }
  return next;
}

function CleanupForm({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const preview = useCleanupPreview(repoPath);
  const [searchRemote, setSearchRemote] = useState(false);
  const stale = useStaleRemoteBranches(repoPath, searchRemote);
  const [files, setFiles] = useState<ReadonlySet<string>>(new Set());
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [merged, setMerged] = useState<ReadonlySet<string>>(new Set());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [remotes, setRemotes] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = preview.data;
  const staleBranches = stale.data ?? [];
  const remoteNames = Array.from(new Set(staleBranches.map((branch) => branch.remote)));
  const selectedRemotes = remoteNames.filter((name) => remotes.has(name));
  const total = files.size + ignored.size + merged.size + gone.size + selectedRemotes.length;
  const lostCommits = data ? data.goneBranches.filter((branch) => gone.has(branch.name) && branch.uniqueCommits > 0).length : 0;
  const consequences: string[] = [];
  if (files.size + ignored.size > 0) {
    consequences.push(t("cleanup.confirm.filesLoss", { count: files.size + ignored.size }));
  }
  if (lostCommits > 0) {
    consequences.push(t("cleanup.confirm.commitsLoss", { count: lostCommits }));
  }

  async function run() {
    setBusy(true);
    const report = await cleanRepository(repoPath, {
      untracked: Array.from(files),
      ignored: Array.from(ignored),
      mergedBranches: Array.from(merged),
      goneBranches: Array.from(gone),
      pruneRemotes: selectedRemotes,
    });
    setBusy(false);
    setConfirming(false);
    if (report) {
      setFiles(new Set());
      setIgnored(new Set());
      setMerged(new Set());
      setGone(new Set());
      setRemotes(new Set());
      if (report.failures.length === 0) {
        onClose();
      }
    }
  }

  let body: ReactNode;
  if (preview.isPending) {
    body = <Skeleton className="h-40" />;
  } else if (preview.isError) {
    const description = describeError(preview.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void preview.refetch()} />;
  } else {
    const fileRows = preview.data.untracked.map((file) => ({
      key: file.path,
      label: file.path,
      detail: file.directory ? t("cleanup.directory") : undefined,
    }));
    const ignoredRows = preview.data.ignored.map((file) => ({
      key: file.path,
      label: file.path,
      detail: file.directory ? t("cleanup.directory") : undefined,
    }));
    const mergedRows = preview.data.mergedBranches.map((branch) => ({ key: branch.name, label: branch.name }));
    const goneRows = preview.data.goneBranches.map((branch) => ({
      key: branch.name,
      label: branch.name,
      detail: branch.uniqueCommits > 0 ? t("cleanup.ownCommits", { count: branch.uniqueCommits }) : undefined,
    }));
    const staleRows = remoteNames.map((name) => ({
      key: name,
      label: name,
      detail: t("cleanup.staleCount", { count: staleBranches.filter((branch) => branch.remote === name).length }),
    }));

    let staleFooter: ReactNode;
    if (!searchRemote) {
      staleFooter = (
        <div>
          <Button size="sm" onClick={() => setSearchRemote(true)}>
            {t("cleanup.stale.search")}
          </Button>
        </div>
      );
    } else if (stale.isPending) {
      staleFooter = <p className="text-xs text-muted">{t("cleanup.stale.searching")}</p>;
    } else if (stale.isError) {
      staleFooter = <p className="text-xs text-danger">{describeError(stale.error).message}</p>;
    } else {
      staleFooter = <p className="text-xs text-muted">{t("cleanup.stale.none")}</p>;
    }

    body = (
      <div className="flex flex-col gap-4">
        <Section
          title={t("cleanup.files.title")}
          description={t("cleanup.files.description")}
          rows={fileRows}
          selected={files}
          onToggle={(key) => setFiles(toggled(files, key))}
          onToggleAll={() => setFiles(toggledAll(files, fileRows.map((row) => row.key)))}
        />
        <Section
          title={t("cleanup.ignored.title")}
          description={t("cleanup.ignored.description")}
          rows={ignoredRows}
          selected={ignored}
          onToggle={(key) => setIgnored(toggled(ignored, key))}
          onToggleAll={() => setIgnored(toggledAll(ignored, ignoredRows.map((row) => row.key)))}
        />
        <Section
          title={t("cleanup.merged.title")}
          description={t("cleanup.merged.description")}
          rows={mergedRows}
          selected={merged}
          onToggle={(key) => setMerged(toggled(merged, key))}
          onToggleAll={() => setMerged(toggledAll(merged, mergedRows.map((row) => row.key)))}
        />
        <Section
          title={t("cleanup.gone.title")}
          description={t("cleanup.gone.description")}
          rows={goneRows}
          selected={gone}
          onToggle={(key) => setGone(toggled(gone, key))}
          onToggleAll={() => setGone(toggledAll(gone, goneRows.map((row) => row.key)))}
        />
        <Section
          title={t("cleanup.stale.title")}
          description={t("cleanup.stale.description")}
          rows={staleRows}
          selected={remotes}
          onToggle={(key) => setRemotes(toggled(remotes, key))}
          onToggleAll={() => setRemotes(toggledAll(remotes, staleRows.map((row) => row.key)))}
          footer={staleFooter}
        />
      </div>
    );
  }

  return (
    <>
      <Dialog
        open
        title={t("cleanup.title")}
        description={t("cleanup.description")}
        onClose={onClose}
        dismissible={!busy}
        width="lg"
        footer={
          <>
            <Button onClick={onClose} disabled={busy}>
              {t("common.close")}
            </Button>
            <Button variant="primary" disabled={total === 0 || busy} onClick={() => setConfirming(true)}>
              {t("cleanup.submit", { count: total })}
            </Button>
          </>
        }
      >
        {body}
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title={t("cleanup.confirm.title")}
        description={t("cleanup.confirm.description", { count: total })}
        consequences={consequences}
        confirmLabel={t("cleanup.confirm.confirm")}
        destructive={consequences.length > 0}
        loading={busy}
        onConfirm={() => void run()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

export function CleanupDialog({ repoPath }: { repoPath: string }) {
  const open = useCleanupDialogStore((state) => state.open);
  const hide = useCleanupDialogStore((state) => state.hide);
  if (!open) {
    return null;
  }
  return <CleanupForm repoPath={repoPath} onClose={hide} />;
}
