import { FolderOpen, GitBranch, Lock, LockOpen, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { Worktree } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { openContextMenu } from "@/shared/ui/context-menu";
import type { ContextMenuEntry } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { openWorktree, pruneStaleWorktrees, unlockExistingWorktree } from "../actions";
import { useWorktreeDialogStore } from "../dialog-store";
import { useWorktrees } from "../queries";
import { folderNameOf, shortHead } from "../worktree-model";

const ROW_HEIGHT = 52;

interface WorktreeListProps {
  repoPath: string;
}

export function WorktreeList({ repoPath }: WorktreeListProps) {
  const { t } = useTranslation();
  const worktrees = useWorktrees(repoPath);
  const showDialog = useWorktreeDialogStore((state) => state.show);
  const showSkeleton = useSkeletonVisible(worktrees.isPending);

  function menuFor(worktree: Worktree): ContextMenuEntry[] {
    const entries: ContextMenuEntry[] = [];
    if (!worktree.isCurrent) {
      entries.push({
        label: t("worktrees.menu.open"),
        icon: <FolderOpen className="size-4" />,
        onSelect: () => void openWorktree(worktree.path),
      });
    }
    if (!worktree.isMain) {
      entries.push(
        worktree.locked
          ? {
              label: t("worktrees.menu.unlock"),
              icon: <LockOpen className="size-4" />,
              onSelect: () => void unlockExistingWorktree(repoPath, worktree.path),
            }
          : {
              label: t("worktrees.menu.lock"),
              icon: <Lock className="size-4" />,
              onSelect: () => showDialog({ kind: "lock", worktree }),
            },
      );
      if (!worktree.isCurrent) {
        entries.push({ kind: "separator" });
        entries.push({
          label: t("worktrees.menu.remove"),
          icon: <Trash2 className="size-4" />,
          destructive: true,
          onSelect: () => showDialog({ kind: "remove", worktree }),
        });
      }
    }
    return entries;
  }

  if (showSkeleton) {
    return <SkeletonRows count={4} rowHeight={ROW_HEIGHT} className="flex-1 px-2" />;
  }
  if (worktrees.isPending) {
    return <div className="flex-1" />;
  }
  if (worktrees.isError) {
    const description = describeError(worktrees.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void worktrees.refetch()} />;
  }

  const stale = worktrees.data.some((worktree) => worktree.prunable);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {worktrees.data.length <= 1 ? (
        <EmptyState
          icon={<GitBranch className="size-5" />}
          title={t("worktrees.empty.title")}
          description={t("worktrees.empty.description")}
          action={
            <Button variant="primary" onClick={() => showDialog({ kind: "create" })}>
              {t("worktrees.new")}
            </Button>
          }
        />
      ) : (
        <VirtualList
          items={worktrees.data}
          rowHeight={ROW_HEIGHT}
          ariaLabel={t("worktrees.listLabel")}
          getKey={(worktree) => worktree.path}
          renderRow={(worktree) => {
            const label = worktree.branch ?? t("worktrees.detached", { head: shortHead(worktree.head) });
            return (
              <button
                type="button"
                aria-current={worktree.isCurrent ? "true" : undefined}
                onClick={() => {
                  if (!worktree.isCurrent) {
                    void openWorktree(worktree.path);
                  }
                }}
                onContextMenu={(event) => openContextMenu(event, menuFor(worktree))}
                title={worktree.path}
                className={cn(
                  "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-0.5 rounded-md px-2.5 text-left transition-colors duration-150",
                  worktree.isCurrent ? "bg-accent-soft" : "hover:bg-subtle",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <GitBranch className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate text-[13px] font-medium">{label}</span>
                  {worktree.isMain ? (
                    <span className="shrink-0 rounded-full bg-subtle px-1.5 py-px text-[10px] text-muted">{t("worktrees.main")}</span>
                  ) : null}
                  {worktree.isCurrent ? (
                    <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[10px] text-accent">{t("worktrees.current")}</span>
                  ) : null}
                  {worktree.locked ? <Lock className="size-3 shrink-0 text-warning" aria-label={t("worktrees.lockedBadge")} /> : null}
                  {worktree.prunable ? (
                    <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-px text-[10px] text-warning">{t("worktrees.missing")}</span>
                  ) : null}
                </span>
                <span className="truncate pl-5 text-[11px] text-muted">{folderNameOf(worktree.path)}</span>
              </button>
            );
          }}
        />
      )}
      {stale ? (
        <div className="border-t border-line p-2">
          <Button
            size="sm"
            className="w-full"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void pruneStaleWorktrees(repoPath)}
          >
            {t("worktrees.prune")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
