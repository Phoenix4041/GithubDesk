import { Boxes, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { Submodule, SubmoduleState } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { openContextMenu } from "@/shared/ui/context-menu";
import type { ContextMenuEntry } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { openSubmodule } from "../actions";
import { useSubmoduleDialogStore } from "../dialog-store";
import { useSubmodules } from "../queries";

const ROW_HEIGHT = 56;

const badgeClasses: Record<SubmoduleState, string> = {
  uninitialized: "bg-subtle text-muted",
  upToDate: "bg-add-bg text-add",
  modified: "bg-warning/15 text-warning",
  conflict: "bg-del-bg text-del",
};

interface SubmoduleListProps {
  repoPath: string;
}

export function SubmoduleList({ repoPath }: SubmoduleListProps) {
  const { t } = useTranslation();
  const submodules = useSubmodules(repoPath);
  const showDialog = useSubmoduleDialogStore((state) => state.show);
  const showSkeleton = useSkeletonVisible(submodules.isPending);

  function menuFor(submodule: Submodule): ContextMenuEntry[] {
    const entries: ContextMenuEntry[] = [];
    if (submodule.state !== "uninitialized") {
      entries.push({
        label: t("submodules.menu.open"),
        icon: <FolderOpen className="size-4" />,
        onSelect: () => void openSubmodule(repoPath, submodule.path),
      });
    }
    entries.push({
      label: t("submodules.menu.update"),
      icon: <RefreshCw className="size-4" />,
      onSelect: () => showDialog({ kind: "update", submodule }),
    });
    entries.push({ kind: "separator" });
    entries.push({
      label: t("submodules.menu.remove"),
      icon: <Trash2 className="size-4" />,
      destructive: true,
      onSelect: () => showDialog({ kind: "remove", submodule }),
    });
    return entries;
  }

  if (showSkeleton) {
    return <SkeletonRows count={4} rowHeight={ROW_HEIGHT} className="flex-1 px-2" />;
  }
  if (submodules.isPending) {
    return <div className="flex-1" />;
  }
  if (submodules.isError) {
    const description = describeError(submodules.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void submodules.refetch()} />;
  }
  if (submodules.data.length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="size-5" />}
        title={t("submodules.empty.title")}
        description={t("submodules.empty.description")}
        action={
          <Button variant="primary" onClick={() => showDialog({ kind: "add" })}>
            {t("submodules.add")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        items={submodules.data}
        rowHeight={ROW_HEIGHT}
        ariaLabel={t("submodules.listLabel")}
        getKey={(submodule) => submodule.path}
        renderRow={(submodule) => (
          <button
            type="button"
            onClick={() => {
              if (submodule.state !== "uninitialized") {
                void openSubmodule(repoPath, submodule.path);
              }
            }}
            onContextMenu={(event) => openContextMenu(event, menuFor(submodule))}
            title={submodule.url ?? submodule.path}
            className="mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-0.5 rounded-md px-2.5 text-left transition-colors duration-150 hover:bg-subtle"
          >
            <span className="flex items-center gap-1.5">
              <Boxes className="size-3.5 shrink-0 text-muted" />
              <span className="truncate text-[13px] font-medium">{submodule.path}</span>
              <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px]", badgeClasses[submodule.state])}>
                {t(`submodules.states.${submodule.state}`)}
              </span>
            </span>
            <span className="truncate pl-5 text-[11px] text-muted">{submodule.url ?? submodule.commit.slice(0, 7)}</span>
          </button>
        )}
      />
      <div className="border-t border-line p-2">
        <Button
          size="sm"
          className="w-full"
          icon={<RefreshCw className="size-3.5" />}
          onClick={() => showDialog({ kind: "update", submodule: null })}
        >
          {t("submodules.updateAll")}
        </Button>
      </div>
    </div>
  );
}
