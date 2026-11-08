import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/features/github/releases/releases-model";
import { cn } from "@/shared/lib/cn";
import { refreshRepository, repoKeys } from "@/shared/lib/query-client";
import { describeError, reportError } from "@/shared/lib/report-error";
import { cancelJob, isCancelled } from "@/shared/lib/tauri-client";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextAreaField } from "@/shared/ui/text-field";
import { disableSparse, findLargeBlobs, loadSize, loadSparse, runMaintenance, setSparse } from "../api";
import type { LargeBlob, MaintenanceReport, SparseState } from "../api";
import { isSafeFolder, parseFolderList, savedBytes } from "../health-model";
import { useHealthDialogStore } from "../store";

type Section = "size" | "blobs" | "sparse" | "maintenance";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5 text-xs last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SizeSection({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const size = useQuery({ queryKey: repoKeys.healthSize(repoPath), queryFn: () => loadSize(repoPath), staleTime: 30_000 });

  if (size.isPending) {
    return <Skeleton className="h-48" />;
  }
  if (size.isError) {
    const description = describeError(size.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void size.refetch()} />;
  }
  const { objects, refs } = size.data;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {t("health.size.total", { size: formatBytes(size.data.gitDirBytes) })}
      </p>
      {size.data.shallow || size.data.partial ? (
        <p className="text-xs text-muted">
          {[size.data.shallow ? t("health.size.shallow") : "", size.data.partial ? t("health.size.partial") : ""].filter(Boolean).join(" ")}
        </p>
      ) : null}
      <section aria-label={t("health.size.objectsTitle")} className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold">{t("health.size.objectsTitle")}</h3>
        <dl className="rounded-md border border-line">
          <Fact label={t("health.size.packed")} value={`${objects.packedObjects} · ${formatBytes(objects.packBytes)}`} />
          <Fact label={t("health.size.packs")} value={String(objects.packs)} />
          <Fact label={t("health.size.loose")} value={`${objects.looseObjects} · ${formatBytes(objects.looseBytes)}`} />
          <Fact label={t("health.size.garbage")} value={`${objects.garbageFiles} · ${formatBytes(objects.garbageBytes)}`} />
        </dl>
      </section>
      <section aria-label={t("health.size.refsTitle")} className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold">{t("health.size.refsTitle")}</h3>
        <dl className="rounded-md border border-line">
          <Fact label={t("health.size.looseRefs")} value={String(refs.looseRefs)} />
          <Fact label={t("health.size.packedRefs")} value={String(refs.packedRefs)} />
          <Fact label={t("health.size.branches")} value={String(refs.branches)} />
          <Fact label={t("health.size.unmerged")} value={String(refs.unmergedBranches)} />
          <Fact label={t("health.size.stashes")} value={String(refs.stashes)} />
        </dl>
      </section>
      {objects.looseObjects > 1000 || objects.packs > 20 ? <p className="text-xs text-warning">{t("health.size.suggestGc")}</p> : null}
    </div>
  );
}

type BlobRun = { state: "running" } | { state: "done"; blobs: LargeBlob[] } | { state: "cancelled" } | { state: "failed"; error: unknown };

function BlobsSection({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; run: BlobRun } | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    const jobId = crypto.randomUUID();
    let active = true;
    jobRef.current = jobId;
    findLargeBlobs(repoPath, jobId)
      .then((blobs) => {
        if (active) {
          setResult({ attempt, run: { state: "done", blobs } });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setResult({ attempt, run: isCancelled(error) ? { state: "cancelled" } : { state: "failed", error } });
        }
      });
    return () => {
      active = false;
      jobRef.current = null;
      void cancelJob(jobId).catch(() => undefined);
    };
  }, [repoPath, attempt]);

  const run: BlobRun = result && result.attempt === attempt ? result.run : { state: "running" };

  if (run.state === "running") {
    return (
      <div className="flex flex-col items-start gap-2" role="status">
        <p className="text-xs text-muted">{t("health.blobs.running")}</p>
        <Skeleton className="h-32 w-full" />
        <Button size="sm" onClick={() => jobRef.current && void cancelJob(jobRef.current).catch(() => undefined)}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }
  if (run.state === "cancelled") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted">{t("health.blobs.cancelled")}</p>
        <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
          {t("health.blobs.retry")}
        </Button>
      </div>
    );
  }
  if (run.state === "failed") {
    const description = describeError(run.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => setAttempt((value) => value + 1)} />;
  }
  if (run.blobs.length === 0) {
    return <p className="text-xs text-muted">{t("health.blobs.empty")}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("health.blobs.hint")}</p>
      <ul className="flex max-h-80 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("health.blobs.listLabel")}>
        {run.blobs.map((blob) => (
          <li key={blob.hash} className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-xs last:border-b-0">
            <span className="min-w-0 flex-1 truncate font-mono" title={blob.path || blob.hash}>
              {blob.path || t("health.blobs.noPath")}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted">{blob.hash.slice(0, 8)}</span>
            <span className="w-16 shrink-0 text-right font-medium">{formatBytes(blob.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SparseForm({ repoPath, state }: { repoPath: string; state: SparseState }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState(state.folders.join("\n"));
  const [confirming, setConfirming] = useState<"set" | "disable" | null>(null);
  const [busy, setBusy] = useState(false);
  const folders = parseFolderList(text);
  const invalid = folders.filter((folder) => !isSafeFolder(folder));

  async function apply(kind: "set" | "disable") {
    setBusy(true);
    try {
      const next = kind === "set" ? await setSparse(repoPath, folders) : await disableSparse(repoPath);
      queryClient.setQueryData(repoKeys.sparse(repoPath), next);
      setText(next.folders.join("\n"));
      await refreshRepository(repoPath);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={cn("rounded-md px-3 py-2 text-xs", state.enabled ? "bg-subtle text-fg" : "bg-subtle text-muted")} role="status">
        {state.enabled ? t("health.sparse.on", { count: state.folders.length }) : t("health.sparse.off")}
      </p>
      <TextAreaField
        label={t("health.sparse.folders")}
        hint={t("health.sparse.foldersHint")}
        error={invalid.length > 0 ? t("health.sparse.invalid", { folder: invalid[0] ?? "" }) : undefined}
        value={text}
        rows={5}
        spellCheck={false}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || folders.length === 0 || invalid.length > 0} onClick={() => setConfirming("set")}>
          {state.enabled ? t("health.sparse.update") : t("health.sparse.enable")}
        </Button>
        {state.enabled ? (
          <Button disabled={busy} onClick={() => setConfirming("disable")}>
            {t("health.sparse.disable")}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "disable" ? t("health.sparse.confirmDisableTitle") : t("health.sparse.confirmSetTitle")}
        description={confirming === "disable" ? t("health.sparse.confirmDisable") : t("health.sparse.confirmSet", { count: folders.length })}
        confirmLabel={confirming === "disable" ? t("health.sparse.disable") : t("health.sparse.apply")}
        loading={busy}
        onConfirm={() => void apply(confirming ?? "set")}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

function SparseSection({ repoPath }: { repoPath: string }) {
  const sparse = useQuery({ queryKey: repoKeys.sparse(repoPath), queryFn: () => loadSparse(repoPath) });
  if (sparse.isPending) {
    return <Skeleton className="h-40" />;
  }
  if (sparse.isError) {
    const description = describeError(sparse.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void sparse.refetch()} />;
  }
  return <SparseForm key={sparse.data.folders.join("\n")} repoPath={repoPath} state={sparse.data} />;
}

function MaintenanceSection({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [report, setReport] = useState<MaintenanceReport | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    const id = crypto.randomUUID();
    setConfirming(false);
    setJobId(id);
    setReport(null);
    setNote(null);
    try {
      setReport(await runMaintenance(repoPath, id));
      await queryClient.invalidateQueries({ queryKey: repoKeys.healthSize(repoPath) });
    } catch (error) {
      if (isCancelled(error)) {
        setNote(t("health.maintenance.cancelled"));
      } else {
        reportError(error);
      }
    } finally {
      setJobId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t("health.maintenance.description")}</p>
      <div className="flex gap-2">
        <Button variant="primary" loading={jobId !== null} onClick={() => setConfirming(true)}>
          {t("health.maintenance.run")}
        </Button>
        {jobId ? <Button onClick={() => void cancelJob(jobId).catch(() => undefined)}>{t("common.cancel")}</Button> : null}
      </div>
      {jobId ? (
        <p className="text-xs text-muted" role="status">
          {t("health.maintenance.running")}
        </p>
      ) : null}
      {note ? <p className="text-xs text-muted">{note}</p> : null}
      {report ? (
        <section aria-label={t("health.maintenance.resultTitle")} className="flex flex-col gap-2">
          <p className="text-sm" role="status">
            {t("health.maintenance.result", {
              before: formatBytes(report.gitDirBefore),
              after: formatBytes(report.gitDirAfter),
              saved: formatBytes(savedBytes(report.gitDirBefore, report.gitDirAfter)),
            })}
          </p>
          <p className="text-xs text-muted">
            {t("health.maintenance.objects", { loose: report.after.looseObjects, packs: report.after.packs })}
          </p>
          {report.summary.length > 0 ? (
            <pre className="selectable max-h-40 overflow-auto rounded-md bg-canvas p-2 font-mono text-[11px] leading-4" tabIndex={0}>
              {report.summary.join("\n")}
            </pre>
          ) : null}
        </section>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={t("health.maintenance.confirmTitle")}
        description={t("health.maintenance.confirm")}
        confirmLabel={t("health.maintenance.run")}
        onConfirm={() => void run()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function HealthBody({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("size");
  const sections: Array<{ id: Section; label: string }> = [
    { id: "size", label: t("health.tabs.size") },
    { id: "blobs", label: t("health.tabs.blobs") },
    { id: "sparse", label: t("health.tabs.sparse") },
    { id: "maintenance", label: t("health.tabs.maintenance") },
  ];
  let body: ReactNode;
  if (section === "size") {
    body = <SizeSection repoPath={repoPath} />;
  } else if (section === "blobs") {
    body = <BlobsSection repoPath={repoPath} />;
  } else if (section === "sparse") {
    body = <SparseSection repoPath={repoPath} />;
  } else {
    body = <MaintenanceSection repoPath={repoPath} />;
  }

  return (
    <Dialog
      open
      title={t("health.title")}
      description={t("health.description")}
      onClose={onClose}
      width="lg"
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}
    >
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label={t("health.tabsLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150",
                section === item.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {body}
      </div>
    </Dialog>
  );
}

export function HealthDialog({ repoPath }: { repoPath: string }) {
  const open = useHealthDialogStore((state) => state.open);
  const hide = useHealthDialogStore((state) => state.hide);
  return open ? <HealthBody repoPath={repoPath} onClose={hide} /> : null;
}
