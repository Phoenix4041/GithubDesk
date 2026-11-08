import { ShieldAlert } from "lucide-react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import type { SecretFinding } from "../api";

interface SecretScanDialogProps {
  open: boolean;
  findings: readonly SecretFinding[];
  busy: boolean;
  onUnstage: () => void;
  onIgnore: () => void;
  onCommitAnyway: () => void;
  onCancel: () => void;
}

const RULE_KEYS: Record<string, ParseKeys> = {
  "github-token": "secretScan.rules.githubToken",
  "aws-access-key": "secretScan.rules.awsAccessKey",
  "private-key": "secretScan.rules.privateKey",
  "slack-token": "secretScan.rules.slackToken",
  "stripe-key": "secretScan.rules.stripeKey",
  "secret-assignment": "secretScan.rules.secretAssignment",
  "env-file": "secretScan.rules.envFile",
};

export function SecretScanDialog({
  open,
  findings,
  busy,
  onUnstage,
  onIgnore,
  onCommitAnyway,
  onCancel,
}: SecretScanDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      title={t("secretScan.title")}
      onClose={onCancel}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} data-autofocus>
            {t("common.cancel")}
          </Button>
          <Button onClick={onCommitAnyway} disabled={busy}>
            {t("secretScan.commitAnyway")}
          </Button>
          <Button onClick={onIgnore} disabled={busy}>
            {t("secretScan.addToGitignore")}
          </Button>
          <Button variant="primary" onClick={onUnstage} loading={busy}>
            {t("secretScan.unstage")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="flex items-start gap-2 text-muted">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t("secretScan.description", { count: findings.length })}
        </p>
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label={t("secretScan.listLabel")}>
          {findings.map((finding) => (
            <li
              key={`${finding.file}:${finding.line}:${finding.rule}`}
              className="flex flex-col rounded-md bg-subtle px-2.5 py-1.5"
            >
              <span className="truncate font-mono text-xs text-fg" title={finding.file}>
                {finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file}
              </span>
              <span className="text-xs text-muted">{t(RULE_KEYS[finding.rule] ?? "secretScan.rules.unknown")}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t("secretScan.ignoreHint")}</p>
      </div>
    </Dialog>
  );
}
