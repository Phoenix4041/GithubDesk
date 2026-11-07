import { GitMerge, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import type { OperationAction, RepoOperation } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { runRepoOperation } from "../actions";
import { useRepoOperation } from "../queries";

interface OperationBannerProps {
  repoPath: string;
  conflictCount: number;
}

interface ActiveBannerProps extends OperationBannerProps {
  operation: RepoOperation;
}

function ConflictOnlyBanner({ conflictCount }: { conflictCount: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2.5 border-b border-line bg-danger-soft px-3 py-2.5" role="alert">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs font-medium">{t("changes.conflictBanner.title", { count: conflictCount })}</p>
        <p className="text-xs text-muted">{t("changes.conflictBanner.description")}</p>
      </div>
    </div>
  );
}

function ActiveOperationBanner({ repoPath, conflictCount, operation }: ActiveBannerProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<OperationAction | null>(null);
  const [confirmingAbort, setConfirmingAbort] = useState(false);

  const name = t(`operation.names.${operation.kind}`);
  const hasConflicts = conflictCount > 0;
  const canSkip = operation.kind !== "merge";
  const progress =
    operation.step !== null && operation.total !== null
      ? t("operation.progress", { step: operation.step, total: operation.total })
      : null;
  const branch = operation.branch ? t("operation.onBranch", { branch: operation.branch }) : null;

  let description: string;
  if (hasConflicts) {
    description = t("operation.resolveConflicts", { count: conflictCount });
  } else if (operation.kind === "rebase") {
    description = t("operation.paused");
  } else {
    description = t("operation.ready");
  }

  async function run(action: OperationAction) {
    setPending(action);
    await runRepoOperation(repoPath, operation.kind, action);
    setPending(null);
    setConfirmingAbort(false);
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 border-b border-line px-3 py-2.5",
        hasConflicts ? "bg-danger-soft" : "bg-accent-soft/60",
      )}
      role="status"
    >
      {hasConflicts ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      ) : (
        <GitMerge className="mt-0.5 size-4 shrink-0 text-accent" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-xs font-medium">
          {t("operation.title", { name: name.charAt(0).toUpperCase() + name.slice(1) })}
          {progress ? <span className="font-normal text-muted"> &middot; {progress}</span> : null}
          {branch ? <span className="font-normal text-muted"> &middot; {branch}</span> : null}
        </p>
        <p className="text-xs text-muted">{description}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={hasConflicts || pending !== null}
            loading={pending === "continue"}
            onClick={() => void run("continue")}
          >
            {t("operation.continue")}
          </Button>
          {canSkip ? (
            <Button size="sm" disabled={pending !== null} loading={pending === "skip"} onClick={() => void run("skip")}>
              {t("operation.skip")}
            </Button>
          ) : null}
          <Button size="sm" disabled={pending !== null} onClick={() => setConfirmingAbort(true)}>
            {t("operation.abort", { name })}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingAbort}
        title={t("operation.abortDialog.title", { name })}
        description={t("operation.abortDialog.description", { name })}
        consequences={[t("operation.abortDialog.loss")]}
        confirmLabel={t("operation.abort", { name })}
        destructive
        loading={pending === "abort"}
        onConfirm={() => void run("abort")}
        onCancel={() => setConfirmingAbort(false)}
      />
    </div>
  );
}

export function OperationBanner({ repoPath, conflictCount }: OperationBannerProps) {
  const operation = useRepoOperation(repoPath);

  if (operation.data) {
    return <ActiveOperationBanner repoPath={repoPath} conflictCount={conflictCount} operation={operation.data} />;
  }
  if (conflictCount > 0) {
    return <ConflictOnlyBanner conflictCount={conflictCount} />;
  }
  return null;
}
