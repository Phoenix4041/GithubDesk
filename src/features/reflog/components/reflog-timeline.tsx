import { GitBranchPlus, History } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { VirtualList } from "@/shared/ui/virtual-list";
import { filterByDate, HEAD_REFERENCE } from "../filters";
import { useReflog, useReflogRefs } from "../queries";
import { useReflogDialogStore } from "../store";

const ROW_HEIGHT = 56;

interface ReflogTimelineProps {
  repoPath: string;
}

export function ReflogTimeline({ repoPath }: ReflogTimelineProps) {
  const { t, i18n } = useTranslation();
  const hide = useReflogDialogStore((state) => state.hide);
  const show = useReflogDialogStore((state) => state.show);
  const [reference, setReference] = useState(HEAD_REFERENCE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const refs = useReflogRefs(repoPath, true);
  const reflog = useReflog(repoPath, reference, true);

  const visible = useMemo(() => filterByDate(reflog.data ?? [], from, to), [reflog.data, from, to]);
  const filtering = from !== "" || to !== "";

  function clearFilters() {
    setFrom("");
    setTo("");
  }

  let body;
  if (reflog.isPending) {
    body = <SkeletonRows count={6} rowHeight={ROW_HEIGHT} />;
  } else if (reflog.isError) {
    const description = describeError(reflog.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void reflog.refetch()} />;
  } else if (reflog.data.length === 0) {
    body = (
      <EmptyState icon={<History className="size-5" />} title={t("reflog.empty.title")} description={t("reflog.empty.description")} />
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        icon={<History className="size-5" />}
        title={t("reflog.timeline.noMatches")}
        action={<Button onClick={clearFilters}>{t("reflog.timeline.clear")}</Button>}
      />
    );
  } else {
    body = (
      <div className="flex h-[46vh] min-h-[220px] flex-col">
        <VirtualList
          items={visible}
          rowHeight={ROW_HEIGHT}
          ariaLabel={t("reflog.listLabel")}
          getKey={(entry) => `${entry.index}-${entry.hash}`}
          renderRow={(entry, position) => (
            <div className="group mx-1 flex h-full items-stretch gap-2 rounded-md px-2 transition-colors duration-150 hover:bg-subtle">
              <div className="relative flex w-4 shrink-0 justify-center" aria-hidden="true">
                <span className={cn("absolute bottom-0 w-px bg-line", position === 0 ? "top-1/2" : "top-0")} />
                <span className="relative top-1/2 size-2.5 -translate-y-1/2 self-start rounded-full border-2 border-accent bg-surface" />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-[112px] shrink-0 truncate rounded bg-accent-soft px-1.5 py-0.5 text-center text-[11px] font-medium text-accent">
                  {t(`reflog.actions.${entry.action}`)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium" title={entry.message}>
                    {entry.message}
                  </span>
                  <span className="text-[11px] text-muted">
                    <span className="font-mono">{entry.shortHash}</span> &middot;{" "}
                    {formatRelativeTime(entry.time, i18n.language)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                {entry.index > 0 && reference === HEAD_REFERENCE ? (
                  <Button size="sm" onClick={() => show({ kind: "restore", entry })}>
                    {t("reflog.restore")}
                  </Button>
                ) : null}
                <Button size="sm" icon={<GitBranchPlus className="size-3.5" />} onClick={() => show({ kind: "recover", entry })}>
                  {t("reflog.createBranch")}
                </Button>
              </div>
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <Dialog open title={t("reflog.title")} description={t("reflog.description")} onClose={hide} width="lg" footer={<Button onClick={hide}>{t("common.close")}</Button>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label htmlFor="reflog-reference" className="text-xs font-medium">
              {t("reflog.timeline.branchFilter")}
            </label>
            <select
              id="reflog-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <option value={HEAD_REFERENCE}>{t("reflog.timeline.head")}</option>
              {(refs.data ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <TextField type="date" label={t("reflog.timeline.from")} value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          <TextField type="date" label={t("reflog.timeline.to")} value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          {filtering ? <Button onClick={clearFilters}>{t("reflog.timeline.clear")}</Button> : null}
        </div>
        {body}
      </div>
    </Dialog>
  );
}
