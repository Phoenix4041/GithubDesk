import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistoryStore } from "@/features/history/store";
import { useUiStore } from "@/shared/lib/ui-store";
import type { BisectState, BisectVerdict } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { finishBisectSession, markBisectCommit } from "../actions";
import { useBisectState } from "../queries";

interface ActiveProps {
  repoPath: string;
  state: BisectState;
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function ActiveBisectBanner({ repoPath, state }: ActiveProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<BisectVerdict | "finish" | null>(null);
  const culprit = state.culprit;
  const hasBad = state.steps.some((step) => step.verdict === "bad");
  const hasGood = state.steps.some((step) => step.verdict === "good");

  async function mark(verdict: BisectVerdict) {
    setPending(verdict);
    await markBisectCommit(repoPath, verdict, null);
    setPending(null);
  }

  async function finish() {
    setPending("finish");
    await finishBisectSession(repoPath);
    setPending(null);
  }

  function showInHistory(hash: string) {
    useUiStore.getState().setTab("history");
    useHistoryStore.getState().selectCommit(hash);
  }

  let progress: string;
  if (!hasBad || !hasGood) {
    progress = t("bisect.banner.needMarks");
  } else if (state.estimatedSteps !== null && state.remaining !== null) {
    progress = t("bisect.banner.progress", { steps: state.estimatedSteps, count: state.remaining });
  } else {
    progress = t("bisect.banner.testing");
  }

  return (
    <div className="flex items-start gap-2.5 border-b border-line bg-accent-soft/60 px-3 py-2.5" role="status">
      <Search className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {culprit ? (
          <>
            <p className="text-xs font-medium">{t("bisect.banner.foundTitle")}</p>
            <p className="truncate text-xs" title={culprit.title}>
              <span className="font-mono">{shortHash(culprit.hash)}</span> &middot; {culprit.title}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => showInHistory(culprit.hash)}>
                {t("bisect.banner.showInHistory")}
              </Button>
              <Button size="sm" disabled={pending !== null} loading={pending === "finish"} onClick={() => void finish()}>
                {state.startRef ? t("bisect.banner.finishTo", { ref: state.startRef }) : t("bisect.banner.finish")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium">{t("bisect.banner.title")}</p>
            {state.currentHash ? (
              <p className="truncate text-xs" title={state.currentTitle ?? undefined}>
                {t("bisect.banner.testing")} <span className="font-mono">{shortHash(state.currentHash)}</span>
                {state.currentTitle ? <> &middot; {state.currentTitle}</> : null}
              </p>
            ) : null}
            <p className="text-xs text-muted">{progress}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={pending !== null}
                loading={pending === "good"}
                onClick={() => void mark("good")}
              >
                {t("bisect.banner.good")}
              </Button>
              <Button size="sm" disabled={pending !== null} loading={pending === "bad"} onClick={() => void mark("bad")}>
                {t("bisect.banner.bad")}
              </Button>
              <Button size="sm" disabled={pending !== null} loading={pending === "skip"} onClick={() => void mark("skip")}>
                {t("bisect.banner.skip")}
              </Button>
              <Button size="sm" disabled={pending !== null} loading={pending === "finish"} onClick={() => void finish()}>
                {t("bisect.banner.finish")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BisectBanner({ repoPath }: { repoPath: string }) {
  const state = useBisectState(repoPath);
  if (!state.data?.active) {
    return null;
  }
  return <ActiveBisectBanner repoPath={repoPath} state={state.data} />;
}
