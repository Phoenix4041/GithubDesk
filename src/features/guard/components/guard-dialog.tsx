import { BellOff, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { silenceFinding } from "../api";
import type { Finding } from "../api";
import { useGuardStore } from "../store";

const MEGABYTE = 1024 * 1024;

function kindLabel(finding: Finding, t: (key: "guard.kinds.secret" | "guard.kinds.largeFile" | "guard.kinds.conflictMarker" | "guard.kinds.riskyFile") => string): string {
  switch (finding.kind) {
    case "secret":
      return t("guard.kinds.secret");
    case "largeFile":
      return t("guard.kinds.largeFile");
    case "conflictMarker":
      return t("guard.kinds.conflictMarker");
    default:
      return t("guard.kinds.riskyFile");
  }
}

export function GuardDialog() {
  const { t } = useTranslation();
  const request = useGuardStore((state) => state.request);
  const setFindings = useGuardStore((state) => state.setFindings);
  const finish = useGuardStore((state) => state.finish);

  if (!request) {
    return null;
  }
  const { repoPath, findings } = request;
  const hasLarge = findings.some((finding) => finding.kind === "largeFile");

  async function silence(finding: Finding) {
    try {
      await silenceFinding(repoPath, finding.rule, finding.path);
    } catch (error) {
      reportError(error);
      return;
    }
    const remaining = findings.filter((item) => !(item.rule === finding.rule && item.path === finding.path));
    if (remaining.length === 0) {
      finish("commit");
    } else {
      setFindings(remaining);
    }
  }

  return (
    <Dialog
      open
      title={t("guard.title")}
      description={t("guard.description")}
      onClose={() => finish("cancel")}
      width="lg"
      footer={
        <>
          <Button onClick={() => finish("cancel")}>{t("guard.cancel")}</Button>
          <Button onClick={() => finish("unstage")}>{t("guard.unstage")}</Button>
          <Button variant="primary" onClick={() => finish("commit")}>
            {t("guard.commitAnyway")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("guard.listLabel")}>
          {findings.map((finding) => (
            <li key={`${finding.rule}:${finding.path}:${finding.line ?? 0}`} className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
              <ShieldAlert className="size-4 shrink-0 text-warning" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs" title={finding.path}>
                  {finding.path}
                  {finding.line ? `:${finding.line}` : ""}
                </span>
                <span className="text-[11px] text-muted">
                  {kindLabel(finding, t)}
                  {finding.size ? ` · ${Math.round(finding.size / MEGABYTE)} MB` : ""}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<BellOff className="size-3.5" />}
                aria-label={t("guard.silenceLabel", { path: finding.path })}
                onClick={() => void silence(finding)}
              >
                {t("guard.silence")}
              </Button>
            </li>
          ))}
        </ul>
        {hasLarge ? <p className="text-xs text-muted">{t("guard.largeHint")}</p> : null}
        <p className="text-xs text-muted">{t("guard.limits")}</p>
      </div>
    </Dialog>
  );
}
