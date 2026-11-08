import { useQuery } from "@tanstack/react-query";
import { GitFork } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { runSyncOperation } from "@/features/sync/operations";
import { useRemotes } from "@/features/sync/queries";
import { i18next } from "@/i18n";
import { queryClient, repoKeys } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { showToast } from "@/shared/ui/toast-store";
import { targetKey } from "../../target";
import type { GithubTarget } from "../../target";
import { addUpstreamRemote, getForkInfo, syncFork } from "../forks-api";
import type { ForkSyncResult } from "../forks-api";

interface ForkSyncCardProps {
  target: GithubTarget;
  repoPath: string;
}

function announce(result: ForkSyncResult, repoPath: string) {
  const pull = { label: i18next.t("github.fork.pullNow"), run: () => void runSyncOperation("pull", repoPath) };
  switch (result.status) {
    case "fastForward":
    case "merged":
      showToast({
        kind: "success",
        title: i18next.t("github.fork.synced", { branch: result.branch }),
        message: result.message,
        actions: [pull],
      });
      break;
    case "upToDate":
      showToast({ kind: "info", title: i18next.t("github.fork.upToDate", { branch: result.branch }) });
      break;
    case "conflict":
      showToast({ kind: "error", title: i18next.t("github.fork.conflict"), message: i18next.t("github.fork.conflictHint") });
      break;
  }
}

export function ForkSyncCard({ target, repoPath }: ForkSyncCardProps) {
  const { t } = useTranslation();
  const info = useQuery({ queryKey: targetKey(target, "fork"), queryFn: () => getForkInfo(target) });
  const remotes = useRemotes(repoPath);
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);

  const parent = info.data?.parent ?? null;
  if (!info.data?.isFork || !parent) {
    return null;
  }
  const branch = info.data.defaultBranch;
  const hasUpstream = (remotes.data ?? []).some((remote) => remote.name === "upstream");

  async function sync() {
    setSyncing(true);
    try {
      announce(await syncFork(target, branch), repoPath);
    } catch (error) {
      reportError(error);
    } finally {
      setSyncing(false);
    }
  }

  async function addRemote(url: string) {
    setAdding(true);
    try {
      await addUpstreamRemote(repoPath, url);
      await queryClient.invalidateQueries({ queryKey: repoKeys.remotes(repoPath) });
      showToast({ kind: "success", title: i18next.t("github.fork.remoteAdded") });
    } catch (error) {
      reportError(error);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3" aria-label={t("github.fork.label")}>
      <p className="flex items-center gap-2 text-[13px]">
        <GitFork className="size-4 text-muted" />
        <span>{t("github.fork.parent", { name: parent.fullName })}</span>
      </p>
      <p className="text-xs text-muted">{t("github.fork.hint", { branch, parentBranch: parent.defaultBranch })}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" loading={syncing} onClick={() => void sync()}>
          {t("github.fork.sync")}
        </Button>
        {remotes.data && !hasUpstream && parent.cloneUrl ? (
          <Button size="sm" loading={adding} onClick={() => void addRemote(parent.cloneUrl)}>
            {t("github.fork.addRemote")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
