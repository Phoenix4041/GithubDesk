import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { checkIcon } from "../../pulls/components/checks-list";
import { summarizeChecks } from "../../pulls/pull-model";
import type { CheckRun } from "../../types";

interface ChecksBadgeProps {
  runs: readonly CheckRun[];
  className?: string;
}

export function ChecksBadge({ runs, className }: ChecksBadgeProps) {
  const { t } = useTranslation();
  const summary = summarizeChecks(runs);
  if (summary.state === "none") {
    return null;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", className)}>
      {summary.state === "success" ? checkIcon("completed", "success", "size-3.5") : null}
      {summary.state === "failure" ? checkIcon("completed", "failure", "size-3.5") : null}
      {summary.state === "pending" ? checkIcon("in_progress", null, "size-3.5") : null}
      {t(`github.checks.badge.${summary.state}`, { passed: summary.passed, failed: summary.failed, total: summary.total })}
    </span>
  );
}
