import { ArrowLeftRight, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useBranches } from "@/features/branches/queries";
import { buildCommitMenu } from "@/features/history/commit-menu";
import { CommitFileRow } from "@/features/history/components/commit-file-row";
import { CommitRow } from "@/features/history/components/commit-row";
import { useHistoryStore } from "@/features/history/store";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import { useUiStore } from "@/shared/lib/ui-store";
import type { CommitSummary } from "@/shared/types/git";
import { openContextMenu } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { closeCompare } from "../actions";
import { COMPARE_COMMIT_LIMIT } from "../api";
import { useCompareCommits, useCompareFiles, useCompareSummary } from "../queries";
import { useCompareStore } from "../store";
import type { CompareView } from "../store";

const FILE_ROW_HEIGHT = 28;
const COMMIT_ROW_HEIGHT = 54;

const selectClasses =
  "h-8 w-full min-w-0 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg transition-colors duration-150 hover:border-muted/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none";

interface ComparePanelProps {
  repoPath: string;
}

interface BranchSelectProps {
  label: string;
  value: string | null;
  names: readonly string[];
  onChange: (name: string) => void;
}

function BranchSelect({ label, value, names, onChange }: BranchSelectProps) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-muted">
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} className={selectClasses}>
        {value === null ? <option value="" /> : null}
        {value !== null && !names.includes(value) ? <option value={value}>{value.slice(0, 7)}</option> : null}
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function showCommitInHistory(commit: CommitSummary): void {
  useHistoryStore.getState().selectCommit(commit.hash);
  useUiStore.getState().setTab("history");
}

export function ComparePanel({ repoPath }: ComparePanelProps) {
  const { t } = useTranslation();
  const base = useCompareStore((state) => state.base);
  const head = useCompareStore((state) => state.head);
  const view = useCompareStore((state) => state.view);
  const selectedFile = useCompareStore((state) => state.selectedFile);
  const setBase = useCompareStore((state) => state.setBase);
  const setHead = useCompareStore((state) => state.setHead);
  const swap = useCompareStore((state) => state.swap);
  const setView = useCompareStore((state) => state.setView);
  const selectFile = useCompareStore((state) => state.selectFile);
  const branches = useBranches(repoPath);

  const exact = useCompareStore((state) => state.exact);
  const pair = useMemo(() => ({ base, head, exact }), [base, head, exact]);
  const summary = useCompareSummary(repoPath, pair);
  const files = useCompareFiles(repoPath, pair);
  const commitRange =
    view === "headCommits" && base && head ? `${base}..${head}` : view === "baseCommits" && base && head ? `${head}..${base}` : null;
  const commits = useCompareCommits(repoPath, commitRange);

  const names = useMemo(() => (branches.data ?? []).map((branch) => branch.name), [branches.data]);

  useEffect(() => {
    if (!selectedFile && view === "files" && files.data && files.data.length > 0) {
      const first = files.data[0];
      if (first) {
        selectFile({ path: first.path, oldPath: first.oldPath });
      }
    }
  }, [files.data, selectedFile, view, selectFile]);

  function handleCommitContextMenu(commit: CommitSummary, event: ReactMouseEvent) {
    openContextMenu(event, buildCommitMenu({ repoPath, commit, selectedNewestFirst: [commit] }));
  }

  const views: Array<{ id: CompareView; label: string }> = [
    { id: "files", label: t("compare.views.files", { count: files.data?.length ?? 0 }) },
    { id: "headCommits", label: t("compare.views.headCommits", { count: summary.data?.onlyInHead ?? 0 }) },
    { id: "baseCommits", label: t("compare.views.baseCommits", { count: summary.data?.onlyInBase ?? 0 }) },
  ];

  let body;
  if (base === null || head === null) {
    body = <EmptyState icon={<ArrowLeftRight className="size-5" />} title={t("compare.pick.title")} description={t("compare.pick.description")} />;
  } else if (base === head) {
    body = <EmptyState icon={<ArrowLeftRight className="size-5" />} title={t("compare.same.title")} description={t("compare.same.description")} />;
  } else if (view === "files") {
    if (files.isError) {
      const description = describeError(files.error);
      body = <ErrorState title={description.title} message={description.message} onRetry={() => void files.refetch()} />;
    } else if (!files.data) {
      body = (
        <div className="flex flex-col gap-2 px-4 pt-3">
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      );
    } else if (files.data.length === 0) {
      body = <EmptyState icon={<ArrowLeftRight className="size-5" />} title={t("compare.noChanges.title")} description={t("compare.noChanges.description")} />;
    } else {
      body = (
        <VirtualList
          items={files.data}
          rowHeight={FILE_ROW_HEIGHT}
          ariaLabel={t("history.filesLabel")}
          getKey={(file) => file.path}
          renderRow={(file) => (
            <CommitFileRow
              file={file}
              selected={selectedFile?.path === file.path}
              onSelect={(chosen) => selectFile({ path: chosen.path, oldPath: chosen.oldPath })}
            />
          )}
        />
      );
    }
  } else if (commits.isError) {
    const description = describeError(commits.error);
    body = <ErrorState title={description.title} message={description.message} onRetry={() => void commits.refetch()} />;
  } else if (!commits.data) {
    body = (
      <div className="flex flex-col gap-2 px-4 pt-3">
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  } else if (commits.data.length === 0) {
    body = <EmptyState icon={<ArrowLeftRight className="size-5" />} title={t("compare.noCommits.title")} description={t("compare.noCommits.description")} />;
  } else {
    body = (
      <>
        <VirtualList
          items={commits.data}
          rowHeight={COMMIT_ROW_HEIGHT}
          ariaLabel={t("history.listLabel")}
          getKey={(commit) => commit.hash}
          renderRow={(commit) => (
            <CommitRow
              commit={commit}
              selected={false}
              graph={null}
              graphWidth={0}
              height={COMMIT_ROW_HEIGHT}
              onSelect={showCommitInHistory}
              onContextMenu={handleCommitContextMenu}
            />
          )}
        />
        {commits.data.length >= COMPARE_COMMIT_LIMIT ? (
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            {t("compare.limited", { count: COMPARE_COMMIT_LIMIT })}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-3">
        <div className="flex items-end gap-1.5">
          <BranchSelect label={t("compare.base")} value={base} names={names} onChange={setBase} />
          <IconButton label={t("compare.swap")} onClick={swap} className="mb-0.5">
            <ArrowLeftRight className="size-4" />
          </IconButton>
          <BranchSelect label={t("compare.head")} value={head} names={names} onChange={setHead} />
          <IconButton label={t("compare.close")} onClick={closeCompare} className="mb-0.5">
            <X className="size-4" />
          </IconButton>
        </div>
        {summary.data?.mergeBase ? (
          <p className="text-[11px] text-muted">
            {t("compare.mergeBase")} <span className="selectable font-mono">{summary.data.mergeBase.slice(0, 7)}</span>
          </p>
        ) : null}
      </div>
      <div role="tablist" aria-label={t("compare.viewsLabel")} className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={cn(
              "h-7 cursor-pointer rounded-md px-2 text-xs font-medium transition-colors duration-150",
              view === item.id ? "bg-subtle text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
