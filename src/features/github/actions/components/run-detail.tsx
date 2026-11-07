import { ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { openExternal } from "@/shared/lib/external";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { StateBadge } from "../../components/state-badge";
import type { BadgeTone } from "../../components/state-badge";
import { checkIcon } from "../../pulls/components/checks-list";
import type { GithubTarget } from "../../target";
import type { Job, WorkflowRun } from "../../types";
import { cancelWorkflowRun, rerunWorkflowRun } from "../run-actions";
import { useRunBundle } from "../queries";
import { durationSeconds, formatDuration, isRunFinished, runOutcome, runTitle, shortSha } from "../run-model";
import type { RunOutcome } from "../run-model";
import { useRunStore } from "../store";
import { JobLog } from "./job-log";

const outcomeTones: Record<RunOutcome, BadgeTone> = {
  success: "success",
  failure: "danger",
  cancelled: "warning",
  running: "warning",
  queued: "muted",
  skipped: "muted",
};

interface RunDetailProps {
  target: GithubTarget;
}

function JobRow({ job, selected, onSelect }: { job: Job; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(job.conclusion === "failure");
  const duration = formatDuration(durationSeconds(job.startedAt, job.completedAt));
  return (
    <li>
      <div className={cn("flex items-center gap-1 rounded-md px-1.5", selected ? "bg-accent-soft" : "hover:bg-subtle")}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={t(open ? "github.actions.collapseSteps" : "github.actions.expandSteps", { job: job.name })}
          onClick={() => setOpen((current) => !current)}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted hover:text-fg"
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")} />
        </button>
        <button
          type="button"
          aria-current={selected ? "true" : undefined}
          onClick={onSelect}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left text-[13px]"
        >
          {checkIcon(job.status, job.conclusion)}
          <span className="min-w-0 flex-1 truncate font-medium">{job.name}</span>
          <span className="shrink-0 text-xs text-muted">{duration}</span>
        </button>
      </div>
      {open && job.steps.length > 0 ? (
        <ul className="mb-1 ml-9 flex flex-col gap-0.5 border-l border-line pl-3">
          {job.steps.map((step) => (
            <li key={step.number} className="flex items-center gap-2 py-0.5 text-xs text-muted">
              {checkIcon(step.status, step.conclusion, "size-3.5")}
              <span className="min-w-0 truncate">{step.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RunHeader({ target, run }: { target: GithubTarget; run: WorkflowRun }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState<"rerun" | "failed" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const outcome = runOutcome(run.status, run.conclusion);
  const finished = isRunFinished(run);

  async function rerun(failedOnly: boolean) {
    setBusy(failedOnly ? "failed" : "rerun");
    await rerunWorkflowRun(target, run.id, failedOnly);
    setBusy(null);
  }

  async function cancel() {
    setBusy("cancel");
    await cancelWorkflowRun(target, run.id);
    setBusy(null);
    setConfirmingCancel(false);
  }

  return (
    <header className="flex flex-col gap-2 border-b border-line px-5 py-3">
      <h2 className="text-[15px] leading-snug font-semibold">
        {runTitle(run)} <span className="font-normal text-muted">#{run.runNumber}</span>
      </h2>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <StateBadge tone={outcomeTones[outcome]} label={t(`github.actions.outcomes.${outcome}`)} icon={checkIcon(run.status, run.conclusion, "size-3")} />
        <span>{run.name ?? "-"}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{run.headBranch ?? "-"}</span>
        <span aria-hidden="true">&middot;</span>
        <code className="font-mono">{shortSha(run.headSha)}</code>
        <span aria-hidden="true">&middot;</span>
        <span>{t("github.actions.event", { event: run.event })}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{run.actor?.login ?? "-"}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{formatRelativeTime(isoToUnixSeconds(run.createdAt), i18n.language)}</span>
        {run.runAttempt && run.runAttempt > 1 ? <span>{t("github.actions.attempt", { number: run.runAttempt })}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {finished ? (
          <>
            <Button size="sm" loading={busy === "rerun"} disabled={busy !== null} onClick={() => void rerun(false)}>
              {t("github.actions.rerun")}
            </Button>
            {outcome === "failure" ? (
              <Button size="sm" loading={busy === "failed"} disabled={busy !== null} onClick={() => void rerun(true)}>
                {t("github.actions.rerunFailed")}
              </Button>
            ) : null}
          </>
        ) : (
          <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => setConfirmingCancel(true)}>
            {t("github.actions.cancel")}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(run.htmlUrl)}>
          {t("github.openOnGithub")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmingCancel}
        title={t("github.actions.cancelDialog.title")}
        description={t("github.actions.cancelDialog.description", { title: runTitle(run) })}
        confirmLabel={t("github.actions.cancelDialog.confirm")}
        destructive
        loading={busy === "cancel"}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirmingCancel(false)}
      />
    </header>
  );
}

export function RunDetail({ target }: RunDetailProps) {
  const { t } = useTranslation();
  const selected = useRunStore((state) => state.selected);
  const selectedJob = useRunStore((state) => state.selectedJob);
  const selectJob = useRunStore((state) => state.selectJob);
  const bundle = useRunBundle(target, selected);

  if (selected === null) {
    return (
      <EmptyState
        icon={checkIcon("completed", "success", "size-5")}
        title={t("github.actions.nothingSelected.title")}
        description={t("github.actions.nothingSelected.description")}
      />
    );
  }
  if (bundle.isPending) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (bundle.isError) {
    const description = describeError(bundle.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void bundle.refetch()} />;
  }

  const { run, jobs } = bundle.data;
  const activeJob = jobs.find((job) => job.id === selectedJob) ?? null;

  return (
    <>
      <RunHeader target={target} run={run} />
      <section aria-label={t("github.actions.jobs")} className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line p-2">
        {jobs.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted">{t("github.actions.noJobs")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} selected={job.id === activeJob?.id} onSelect={() => selectJob(job.id)} />
            ))}
          </ul>
        )}
      </section>
      {activeJob ? (
        <JobLog target={target} job={activeJob} />
      ) : (
        <p className="p-4 text-xs text-muted">{t("github.actions.log.pick")}</p>
      )}
    </>
  );
}
