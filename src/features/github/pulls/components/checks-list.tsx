import { CircleAlert, CircleCheck, CircleDashed, CircleX, Loader } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { openExternal } from "@/shared/lib/external";
import type { CheckRun } from "../../types";
import { summarizeChecks } from "../pull-model";

export function checkIcon(status: string | null, conclusion: string | null, size = "size-4"): ReactNode {
  if (status !== "completed") {
    return <Loader className={cn(size, "text-warning")} />;
  }
  switch (conclusion) {
    case "success":
      return <CircleCheck className={cn(size, "text-add")} />;
    case "failure":
    case "timed_out":
    case "startup_failure":
      return <CircleX className={cn(size, "text-del")} />;
    case "cancelled":
    case "action_required":
      return <CircleAlert className={cn(size, "text-warning")} />;
    default:
      return <CircleDashed className={cn(size, "text-muted")} />;
  }
}

export function ChecksList({ checks }: { checks: CheckRun[] }) {
  const { t } = useTranslation();
  const summary = summarizeChecks(checks);
  if (summary.state === "none") {
    return null;
  }
  return (
    <section className="rounded-lg border border-line" aria-label={t("github.pulls.checks.title")}>
      <header className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-1.5 text-xs font-medium">
        {summary.state === "success" ? checkIcon("completed", "success") : null}
        {summary.state === "failure" ? checkIcon("completed", "failure") : null}
        {summary.state === "pending" ? checkIcon("in_progress", null) : null}
        {t(`github.pulls.checks.${summary.state}`, { passed: summary.passed, failed: summary.failed, total: summary.total })}
      </header>
      <ul className="flex flex-col divide-y divide-line">
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            {checkIcon(check.status, check.conclusion)}
            <span className="min-w-0 flex-1 truncate">{check.name}</span>
            {check.htmlUrl ? (
              <button
                type="button"
                onClick={() => void openExternal(check.htmlUrl ?? "")}
                className="cursor-pointer text-accent hover:underline"
              >
                {t("github.details")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
