import { ArrowLeftRight, Check, TriangleAlert, Cloud, CloudUpload, GitBranch, GitMerge, ListEnd, Pencil, SearchX, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openCompare } from "@/features/compare/actions";
import { useMergeDialogStore } from "@/features/merge/store";
import { usePredictions } from "@/features/predict/queries";
import { useRebaseOntoStore } from "@/features/rebase/store";
import { runSyncOperation } from "@/features/sync/operations";
import { describeError } from "@/shared/lib/report-error";
import { cn } from "@/shared/lib/cn";
import type { Branch } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { openContextMenu } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { SearchInput } from "@/shared/ui/search-input";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { switchToBranch } from "../actions";
import { useBranchDialogStore } from "../dialog-store";
import { useBranches } from "../queries";

const ROW_HEIGHT = 32;

type BranchListRow =
  | { kind: "header"; key: string; title: string; count: number }
  | { kind: "branch"; key: string; branch: Branch };

interface BranchListProps {
  repoPath: string;
}

function buildRows(branches: readonly Branch[], query: string, localTitle: string, remoteTitle: string): BranchListRow[] {
  const needle = query.trim().toLowerCase();
  const matching = needle ? branches.filter((branch) => branch.name.toLowerCase().includes(needle)) : branches;
  const local = matching.filter((branch) => !branch.isRemote);
  const remote = matching.filter((branch) => branch.isRemote);
  const rows: BranchListRow[] = [];
  if (local.length > 0) {
    rows.push({ kind: "header", key: "header:local", title: localTitle, count: local.length });
    local.forEach((branch) => rows.push({ kind: "branch", key: branch.fullName, branch }));
  }
  if (remote.length > 0) {
    rows.push({ kind: "header", key: "header:remote", title: remoteTitle, count: remote.length });
    remote.forEach((branch) => rows.push({ kind: "branch", key: branch.fullName, branch }));
  }
  return rows;
}

export function BranchList({ repoPath }: BranchListProps) {
  const { t } = useTranslation();
  const branches = useBranches(repoPath);
  const showDialog = useBranchDialogStore((state) => state.show);
  const showMerge = useMergeDialogStore((state) => state.show);
  const showRebaseOnto = useRebaseOntoStore((state) => state.show);
  const [query, setQuery] = useState("");
  const showSkeleton = useSkeletonVisible(branches.isPending);

  const allBranches = useMemo(() => branches.data ?? [], [branches.data]);
  const rows = useMemo(
    () => buildRows(allBranches, query, t("branches.local"), t("branches.remote")),
    [allBranches, query, t],
  );

  const currentBranch = allBranches.find((candidate) => candidate.isCurrent);
  const candidates = useMemo(
    () => allBranches.filter((candidate) => !candidate.isRemote && !candidate.isCurrent).map((candidate) => candidate.name),
    [allBranches],
  );
  const predictions = usePredictions(repoPath, candidates, currentBranch !== undefined);

  function renderRow(row: BranchListRow) {
    if (row.kind === "header") {
      return (
        <h3 className="flex h-full items-end gap-2 px-4 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
          {row.title}
          <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] tabular-nums">{row.count}</span>
        </h3>
      );
    }
    const { branch } = row;
    const current = allBranches.find((candidate) => candidate.isCurrent);
    return (
      <div
        onContextMenu={(event) =>
          openContextMenu(event, [
            {
              label: t("compare.menu.withCurrent"),
              icon: <ArrowLeftRight className="size-4" />,
              disabled: !current || branch.isCurrent,
              onSelect: () => {
                if (current) {
                  openCompare(current.name, branch.name);
                }
              },
            },
            {
              label: t("merge.menu"),
              icon: <GitMerge className="size-4" />,
              disabled: !current || branch.isCurrent,
              onSelect: () => showMerge(branch.name),
            },
            {
              label: t("rebaseOnto.menu"),
              icon: <ListEnd className="size-4" />,
              disabled: !current || branch.isCurrent,
              onSelect: () => showRebaseOnto(branch.name),
            },
          ])
        }
        className={cn(
          "group mx-1.5 flex h-[calc(100%-2px)] items-center gap-1 rounded-md pr-1 transition-colors duration-150",
          branch.isCurrent ? "bg-accent-soft" : "hover:bg-subtle",
        )}
      >
        <button
          type="button"
          aria-current={branch.isCurrent ? "true" : undefined}
          onClick={() => void switchToBranch(repoPath, branch, allBranches)}
          title={branch.name}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left"
        >
          {branch.isRemote ? (
            <Cloud className="size-3.5 shrink-0 text-muted" />
          ) : (
            <GitBranch className={cn("size-3.5 shrink-0", branch.isCurrent ? "text-accent" : "text-muted")} />
          )}
          <span className={cn("truncate text-[13px]", branch.isCurrent && "font-medium")}>{branch.name}</span>
          {branch.ahead > 0 || branch.behind > 0 ? (
            <span className="ml-auto shrink-0 text-[11px] text-muted tabular-nums">
              {branch.ahead > 0 ? `↑${branch.ahead}` : ""} {branch.behind > 0 ? `↓${branch.behind}` : ""}
            </span>
          ) : null}
          {predictions.get(branch.name)?.conflicts ? (
            <TriangleAlert
              className="ml-auto size-3.5 shrink-0 text-warning"
              aria-label={t("predict.badge", { count: predictions.get(branch.name)?.files.length ?? 0 })}
            />
          ) : null}
          {branch.upstreamGone ? (
            <span className="ml-auto shrink-0 text-[10px] text-warning">{t("branches.upstreamGone")}</span>
          ) : null}
        </button>
        {branch.isCurrent ? <Check className="mr-1 size-3.5 shrink-0 text-accent" aria-label={t("branches.current")} /> : null}
        {!branch.isRemote ? (
          <div className="flex items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            {!branch.upstream ? (
              <IconButton
                label={t("branches.publish", { name: branch.name })}
                onClick={() => void runSyncOperation("publish", repoPath, branch.name)}
                className="size-6"
              >
                <CloudUpload className="size-3.5" />
              </IconButton>
            ) : null}
            <IconButton
              label={t("branches.rename", { name: branch.name })}
              onClick={() => showDialog({ kind: "rename", name: branch.name })}
              className="size-6"
            >
              <Pencil className="size-3.5" />
            </IconButton>
            {!branch.isCurrent ? (
              <IconButton
                label={t("branches.delete", { name: branch.name })}
                onClick={() => showDialog({ kind: "delete", name: branch.name, force: false })}
                className="size-6"
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  let content;
  if (showSkeleton) {
    content = <SkeletonRows count={6} rowHeight={ROW_HEIGHT} />;
  } else if (branches.isPending) {
    content = <div className="flex-1" />;
  } else if (branches.isError) {
    const description = describeError(branches.error);
    content = <ErrorState title={description.title} message={description.message} onRetry={() => void branches.refetch()} />;
  } else if (allBranches.length === 0) {
    content = (
      <EmptyState
        icon={<GitBranch className="size-5" />}
        title={t("branches.empty.title")}
        description={t("branches.empty.description")}
      />
    );
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon={<SearchX className="size-5" />}
        title={t("branches.noResults.title")}
        description={t("branches.noResults.description")}
        action={
          <Button size="sm" onClick={() => setQuery("")}>
            {t("common.clearSearch")}
          </Button>
        }
      />
    );
  } else {
    content = (
      <VirtualList
        items={rows}
        rowHeight={ROW_HEIGHT}
        ariaLabel={t("branches.title")}
        getKey={(row) => row.key}
        renderRow={renderRow}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="px-3">
        <SearchInput label={t("branches.search")} value={query} onValueChange={setQuery} />
      </div>
      {content}
    </div>
  );
}
