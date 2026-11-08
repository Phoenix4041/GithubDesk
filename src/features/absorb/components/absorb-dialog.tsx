import { GitCommitHorizontal, Magnet } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { i18next } from "@/i18n";
import { repoKeys } from "@/shared/lib/query-client";
import { performRepoAction } from "@/shared/lib/repo-action";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { showToast } from "@/shared/ui/toast-store";
import { previewAbsorb, runAbsorb } from "../api";
import type { SkipReason } from "../api";
import { useAbsorbDialogStore } from "../store";

function reasonText(reason: SkipReason): string {
  switch (reason) {
    case "onlyAdditions":
      return i18next.t("absorb.reasons.onlyAdditions");
    case "manyCommits":
      return i18next.t("absorb.reasons.manyCommits");
    case "published":
      return i18next.t("absorb.reasons.published");
    case "unsupported":
      return i18next.t("absorb.reasons.unsupported");
    default:
      return i18next.t("absorb.reasons.notFound");
  }
}

function Body({ repoPath, onDone }: { repoPath: string; onDone: () => void }) {
  const { t } = useTranslation();
  const plan = useQuery({ queryKey: repoKeys.absorb(repoPath), queryFn: () => previewAbsorb(repoPath), staleTime: 0, retry: false });
  const [busy, setBusy] = useState<"fixup" | "squash" | null>(null);

  async function run(squash: boolean) {
    setBusy(squash ? "squash" : "fixup");
    let fixups = 0;
    const done = await performRepoAction(repoPath, async () => {
      const report = await runAbsorb(repoPath, squash);
      fixups = report.fixups;
    });
    setBusy(null);
    if (done) {
      showToast({ kind: "success", title: t(squash ? "absorb.squashed" : "absorb.created", { count: fixups }) });
      onDone();
    }
  }

  if (plan.isPending) {
    return <Skeleton className="h-32" />;
  }
  if (plan.isError) {
    const description = describeError(plan.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void plan.refetch()} />;
  }
  const { assignments, skipped } = plan.data;
  if (assignments.length === 0 && skipped.length === 0) {
    return <EmptyState icon={<Magnet className="size-5" />} title={t("absorb.empty.title")} description={t("absorb.empty.description")} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {assignments.length > 0 ? (
        <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("absorb.listLabel")}>
          {assignments.map((item) => (
            <li key={`${item.path}:${item.hunk}`} className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
              <GitCommitHorizontal className="size-4 shrink-0 text-accent" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs">
                  {item.path} <span className="text-muted">{item.hunk.split("@@")[1]?.trim()}</span>
                </span>
                <span className="truncate text-[11px] text-muted">
                  {t("absorb.goesTo", { hash: item.target.shortHash, title: item.target.title })}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-muted tabular-nums">
                +{item.added} -{item.removed}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{t("absorb.nothingToAbsorb")}</p>
      )}
      {skipped.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold">{t("absorb.skippedTitle", { count: skipped.length })}</h3>
          <ul className="flex max-h-24 flex-col overflow-y-auto text-xs text-muted">
            {skipped.map((item) => (
              <li key={`${item.path}:${item.hunk ?? ""}`} className="truncate">
                <span className="font-mono">{item.path}</span> &middot; {reasonText(item.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted">{t("absorb.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={assignments.length === 0 || busy !== null} loading={busy === "squash"} onClick={() => void run(true)}>
          {t("absorb.applyAndSquash")}
        </Button>
        <Button disabled={assignments.length === 0 || busy !== null} loading={busy === "fixup"} onClick={() => void run(false)}>
          {t("absorb.onlyFixups")}
        </Button>
      </div>
    </div>
  );
}

export function AbsorbDialog({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const open = useAbsorbDialogStore((state) => state.open);
  const hide = useAbsorbDialogStore((state) => state.hide);
  if (!open) {
    return null;
  }
  return (
    <Dialog
      open
      title={t("absorb.title")}
      description={t("absorb.description")}
      onClose={hide}
      width="lg"
      footer={<Button onClick={hide}>{t("common.close")}</Button>}
    >
      <Body repoPath={repoPath} onDone={hide} />
    </Dialog>
  );
}
