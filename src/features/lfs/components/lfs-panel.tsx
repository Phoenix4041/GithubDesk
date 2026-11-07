import { CloudDownload, HardDrive, Plus, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCancellableJob } from "@/shared/hooks/use-cancellable-job";
import { describeProgress } from "@/shared/lib/progress";
import { describeError } from "@/shared/lib/report-error";
import type { LfsStatus } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { showToast } from "@/shared/ui/toast-store";
import { i18next } from "@/i18n";
import { enableLfs, runRepoWork, trackPattern, untrackPattern } from "../actions";
import { pullLfsFiles } from "../api";
import { useLfsStatus } from "../queries";

interface LfsPanelProps {
  repoPath: string;
}

function Body({ repoPath, status }: { repoPath: string; status: LfsStatus }) {
  const { t } = useTranslation();
  const { run, cancel, running, progress } = useCancellableJob();
  const [pattern, setPattern] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = status.filtersConfigured && status.hooksInstalled;
  const missing = status.files.filter((file) => !file.present).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pattern.trim() === "" || busy) {
      return;
    }
    setBusy(true);
    const succeeded = await trackPattern(repoPath, pattern.trim());
    setBusy(false);
    if (succeeded) {
      setPattern("");
    }
  }

  async function pull() {
    const succeeded = await runRepoWork(repoPath, () => run((jobId, onProgress) => pullLfsFiles(repoPath, jobId, onProgress)));
    if (succeeded) {
      showToast({ kind: "success", title: i18next.t("lfs.pulled") });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {!ready ? (
        <div className="m-3 flex flex-col gap-2 rounded-lg border border-line bg-subtle p-3">
          <p className="text-xs text-muted">{t("lfs.notReady")}</p>
          <Button size="sm" variant="primary" className="w-fit" onClick={() => void enableLfs(repoPath)}>
            {t("lfs.enable")}
          </Button>
        </div>
      ) : null}

      <section className="flex flex-col gap-2 px-3 py-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t("lfs.patterns")}</h3>
        <form onSubmit={(event) => void submit(event)} className="flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <TextField
              label={t("lfs.newPattern")}
              placeholder="*.psd"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              spellCheck={false}
            />
          </div>
          <Button type="submit" size="sm" icon={<Plus className="size-3.5" />} disabled={pattern.trim() === ""} loading={busy}>
            {t("lfs.track")}
          </Button>
        </form>
        {status.patterns.length === 0 ? (
          <p className="text-xs text-muted">{t("lfs.noPatterns")}</p>
        ) : (
          <ul className="flex flex-col">
            {status.patterns.map((item) => (
              <li key={`${item.source}:${item.pattern}`} className="flex items-center gap-2 py-1">
                <code className="min-w-0 flex-1 truncate font-mono text-xs" title={item.pattern}>
                  {item.pattern}
                </code>
                <span className="shrink-0 text-[11px] text-muted" title={item.source}>
                  {item.source}
                </span>
                <IconButton label={t("lfs.untrack", { pattern: item.pattern })} onClick={() => void untrackPattern(repoPath, item.pattern)}>
                  <X className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-line px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t("lfs.files", { count: status.files.length })}</h3>
          <Button size="sm" icon={<CloudDownload className="size-3.5" />} onClick={() => void pull()} disabled={running}>
            {missing > 0 ? t("lfs.pullMissing", { count: missing }) : t("lfs.pull")}
          </Button>
        </div>
        {running ? (
          <div className="flex flex-col gap-1.5" role="status">
            <ProgressBar percent={progress ? progress.percent : null} label={t("lfs.pulling")} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">{progress ? describeProgress(progress) : t("lfs.pulling")}</p>
              <Button size="sm" onClick={cancel}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : null}
        {status.files.length === 0 ? (
          <p className="text-xs text-muted">{t("lfs.noFiles")}</p>
        ) : (
          <ul className="flex flex-col">
            {status.files.map((file) => (
              <li key={`${file.oid}:${file.path}`} className="flex items-center gap-2 py-1" title={`${file.path} (${file.oid.slice(0, 10)})`}>
                <HardDrive className="size-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs">{file.path}</span>
                {file.size ? <span className="shrink-0 text-[11px] text-muted">{file.size}</span> : null}
                {!file.present ? (
                  <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-px text-[10px] text-warning">{t("lfs.pointerOnly")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {status.filesTruncated ? <p className="text-[11px] text-muted">{t("lfs.truncated")}</p> : null}
      </section>
    </div>
  );
}

export function LfsPanel({ repoPath }: LfsPanelProps) {
  const { t } = useTranslation();
  const status = useLfsStatus(repoPath);
  const showSkeleton = useSkeletonVisible(status.isPending);

  if (showSkeleton) {
    return <SkeletonRows count={4} rowHeight={36} className="flex-1 px-2" />;
  }
  if (status.isPending) {
    return <div className="flex-1" />;
  }
  if (status.isError) {
    const description = describeError(status.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void status.refetch()} />;
  }
  if (!status.data.installed) {
    return <EmptyState icon={<HardDrive className="size-5" />} title={t("lfs.missing.title")} description={t("lfs.missing.description")} />;
  }
  return <Body repoPath={repoPath} status={status.data} />;
}
