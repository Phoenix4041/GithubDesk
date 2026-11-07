import { Archive, ArchiveRestore, GitBranchPlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { describeError } from "@/shared/lib/report-error";
import type { Stash } from "@/shared/types/git";
import { openContextMenu } from "@/shared/ui/context-menu";
import type { ContextMenuEntry } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { applyStashEntry, openStash } from "../actions";
import { useStashes } from "../queries";
import { useStashDialogStore, useStashStore } from "../store";

const ROW_HEIGHT = 48;

interface StashListProps {
  repoPath: string;
}

export function StashList({ repoPath }: StashListProps) {
  const { t, i18n } = useTranslation();
  const stashes = useStashes(repoPath);
  const selectedHash = useStashStore((state) => state.selectedHash);
  const showDialog = useStashDialogStore((state) => state.show);
  const showSkeleton = useSkeletonVisible(stashes.isPending);

  function menuFor(stash: Stash): ContextMenuEntry[] {
    return [
      {
        label: t("stash.menu.apply"),
        icon: <ArchiveRestore className="size-4" />,
        onSelect: () => void applyStashEntry(repoPath, stash.hash, false),
      },
      {
        label: t("stash.menu.pop"),
        icon: <ArchiveRestore className="size-4" />,
        onSelect: () => void applyStashEntry(repoPath, stash.hash, true),
      },
      {
        label: t("stash.menu.branch"),
        icon: <GitBranchPlus className="size-4" />,
        onSelect: () => showDialog({ kind: "branch", stash }),
      },
      { kind: "separator" },
      {
        label: t("stash.menu.drop"),
        icon: <Trash2 className="size-4" />,
        destructive: true,
        onSelect: () => showDialog({ kind: "drop", stash }),
      },
    ];
  }

  if (showSkeleton) {
    return <SkeletonRows count={5} rowHeight={ROW_HEIGHT} className="flex-1 px-2" />;
  }
  if (stashes.isPending) {
    return <div className="flex-1" />;
  }
  if (stashes.isError) {
    const description = describeError(stashes.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void stashes.refetch()} />;
  }
  if (stashes.data.length === 0) {
    return (
      <EmptyState
        icon={<Archive className="size-5" />}
        title={t("stash.empty.title")}
        description={t("stash.empty.description")}
      />
    );
  }

  return (
    <VirtualList
      items={stashes.data}
      rowHeight={ROW_HEIGHT}
      ariaLabel={t("stash.listLabel")}
      getKey={(stash) => stash.hash}
      renderRow={(stash) => {
        const selected = stash.hash === selectedHash;
        return (
          <button
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={() => openStash(stash.hash)}
            onContextMenu={(event) => openContextMenu(event, menuFor(stash))}
            title={stash.message}
            className={cn(
              "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-0.5 rounded-md px-2.5 text-left transition-colors duration-150",
              selected ? "bg-accent-soft" : "hover:bg-subtle",
            )}
          >
            <span className="truncate text-[13px] font-medium">{stash.message}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              {stash.branch ? <span className="truncate">{t("stash.onBranch", { branch: stash.branch })}</span> : null}
              {stash.branch ? <span aria-hidden="true">&middot;</span> : null}
              <span className="shrink-0">{formatRelativeTime(stash.time, i18n.language)}</span>
            </span>
          </button>
        );
      }}
    />
  );
}
