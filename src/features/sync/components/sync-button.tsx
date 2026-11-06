import { ArrowDown, ArrowUp, CloudUpload, RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useStatus } from "@/features/changes/queries";
import { describeProgress } from "@/shared/lib/progress";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { cancelSyncOperation, runSyncOperation } from "../operations";
import { useRemotes } from "../queries";
import { useSyncStore } from "../store";
import type { SyncKind } from "../store";

interface SyncButtonProps {
  repoPath: string;
}

interface PrimaryAction {
  kind: SyncKind | null;
  label: string;
  hint?: string;
  icon: ReactNode;
}

export function SyncButton({ repoPath }: SyncButtonProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const remotes = useRemotes(repoPath);
  const operation = useSyncStore((state) => state.operation);

  if (operation && operation.repoPath === repoPath) {
    const phaseLabel = operation.progress ? describeProgress(operation.progress) : t(`sync.running.${operation.kind}`);
    return (
      <div className="flex w-[260px] items-center gap-2" role="status" aria-live="polite">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-xs font-medium">{phaseLabel}</span>
          <ProgressBar percent={operation.progress ? operation.progress.percent : null} label={t(`sync.running.${operation.kind}`)} />
        </div>
        <IconButton label={t("common.cancel")} onClick={cancelSyncOperation}>
          <X className="size-4" />
        </IconButton>
      </div>
    );
  }

  const branch = status.data?.branch;
  let primary: PrimaryAction;

  if (!branch || !remotes.data) {
    primary = { kind: null, label: t("sync.fetch"), icon: <RefreshCw className="size-4" /> };
  } else if (remotes.data.length === 0) {
    primary = { kind: null, label: t("sync.noRemote"), hint: t("sync.noRemoteHint"), icon: <CloudUpload className="size-4" /> };
  } else if (branch.unborn) {
    primary = { kind: null, label: t("sync.fetch"), hint: t("sync.noCommitsHint"), icon: <RefreshCw className="size-4" /> };
  } else if (!branch.upstream && branch.head) {
    primary = { kind: "publish", label: t("sync.publish"), icon: <CloudUpload className="size-4" /> };
  } else if (branch.behind > 0) {
    primary = { kind: "pull", label: t("sync.pull", { count: branch.behind }), icon: <ArrowDown className="size-4" /> };
  } else if (branch.ahead > 0) {
    primary = { kind: "push", label: t("sync.push", { count: branch.ahead }), icon: <ArrowUp className="size-4" /> };
  } else {
    primary = { kind: "fetch", label: t("sync.fetch"), icon: <RefreshCw className="size-4" /> };
  }

  const showSecondaryFetch = primary.kind !== null && primary.kind !== "fetch";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={primary.kind === "fetch" || primary.kind === null ? "secondary" : "primary"}
        icon={primary.icon}
        disabled={primary.kind === null}
        title={primary.hint}
        onClick={() => {
          if (primary.kind) {
            void runSyncOperation(primary.kind, repoPath, primary.kind === "publish" ? branch?.head ?? undefined : undefined);
          }
        }}
      >
        {primary.label}
      </Button>
      {showSecondaryFetch ? (
        <IconButton label={t("sync.fetch")} onClick={() => void runSyncOperation("fetch", repoPath)}>
          <RefreshCw className="size-4" />
        </IconButton>
      ) : null}
    </div>
  );
}
