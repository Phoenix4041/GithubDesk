import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import type { GithubTarget } from "../../target";
import type { Job } from "../../types";
import { useJobLog } from "../queries";
import { parseLog } from "../run-model";
import type { LogLineKind } from "../run-model";

const lineClasses: Record<LogLineKind, string> = {
  plain: "text-fg",
  command: "text-accent",
  group: "mt-1 font-semibold text-fg",
  warning: "text-warning",
  error: "text-del",
};

interface JobLogProps {
  target: GithubTarget;
  job: Job;
}

export function JobLog({ target, job }: JobLogProps) {
  const { t } = useTranslation();
  const finished = job.status === "completed";
  const log = useJobLog(target, job.id, finished);
  const lines = useMemo(() => (log.data ? parseLog(log.data.text) : []), [log.data]);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (element && lines.length > 0) {
      element.scrollTop = element.scrollHeight;
    }
  }, [job.id, lines.length]);

  if (log.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }
  if (log.isError) {
    const description = describeError(log.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void log.refetch()} />;
  }
  if (lines.length === 0) {
    return <p className="p-4 text-xs text-muted">{t("github.actions.log.empty")}</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {log.data.truncated ? (
        <p className="border-b border-line bg-warning/10 px-3 py-1.5 text-xs text-warning">{t("github.actions.log.truncated")}</p>
      ) : null}
      <div ref={container} role="log" aria-label={t("github.actions.log.label", { job: job.name })} className="min-h-0 flex-1 overflow-auto bg-canvas p-3">
        <pre className="font-mono text-[11.5px] leading-[1.5]">
          {lines.map((line, index) => (
            <span key={index} className={cn("block min-h-[1.5em] whitespace-pre", lineClasses[line.kind])}>
              {line.text}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
