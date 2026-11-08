import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { openExternal } from "@/shared/lib/external";
import { call } from "@/shared/lib/tauri-client";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { targetKey } from "../../target";
import type { GithubTarget } from "../../target";
import { QueryError, SectionFrame } from "./section-frame";

export interface SecurityAlert {
  number: number;
  state: string;
  dependency: { package: { name: string; ecosystem: string } | null; manifestPath: string } | null;
  securityAdvisory: { summary: string; severity: string; cveId: string | null };
  htmlUrl: string;
  createdAt: string;
}

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
type Severity = (typeof SEVERITIES)[number];

export function severityOf(value: string): Severity {
  return (SEVERITIES as readonly string[]).includes(value) ? (value as Severity) : "low";
}

export function sortBySeverity(alerts: readonly SecurityAlert[]): SecurityAlert[] {
  const rank = (alert: SecurityAlert) => SEVERITIES.indexOf(severityOf(alert.securityAdvisory.severity));
  return [...alerts].sort((left, right) => rank(left) - rank(right) || right.number - left.number);
}

const TONE: Record<Severity, string> = {
  critical: "bg-danger/15 text-danger",
  high: "bg-danger/15 text-danger",
  medium: "bg-warning/15 text-warning",
  low: "bg-subtle text-muted",
};

export function SecuritySection({ target }: { target: GithubTarget }) {
  const { t } = useTranslation();
  const alerts = useQuery({
    queryKey: targetKey(target, "security-alerts"),
    queryFn: () =>
      call<SecurityAlert[]>("github_security_alerts", { accountId: target.accountId, owner: target.owner, repo: target.repo }),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <SectionFrame title={t("github.settings.sections.security")} description={t("github.settings.security.intro")}>
      {alerts.isPending ? (
        <Skeleton className="h-24" />
      ) : alerts.isError ? (
        <QueryError error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : alerts.data.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title={t("github.settings.security.none")} />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.sections.security")}>
          {sortBySeverity(alerts.data).map((alert) => {
            const severity = severityOf(alert.securityAdvisory.severity);
            return (
              <li key={alert.number} className="flex items-center gap-2.5 px-3 py-2.5">
                <span className={cn("shrink-0 rounded-full px-2 py-px text-[10px] font-medium", TONE[severity])}>
                  {t(`github.settings.security.severity.${severity}`)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px]">{alert.securityAdvisory.summary}</span>
                  <span className="truncate text-[11px] text-muted">
                    {alert.dependency?.package?.name ?? "?"}
                    {alert.dependency?.package ? ` (${alert.dependency.package.ecosystem})` : ""}
                    {alert.securityAdvisory.cveId ? ` · ${alert.securityAdvisory.cveId}` : ""}
                  </span>
                </div>
                <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(alert.htmlUrl)}>
                  {t("github.settings.security.open")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionFrame>
  );
}
