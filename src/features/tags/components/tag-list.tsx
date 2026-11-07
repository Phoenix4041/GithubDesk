import { Copy, CloudUpload, Tag as TagIcon, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { Tag } from "@/shared/types/git";
import { openContextMenu } from "@/shared/ui/context-menu";
import type { ContextMenuEntry } from "@/shared/ui/context-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { SearchInput } from "@/shared/ui/search-input";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { pushLocalTag } from "../actions";
import { useTagDialogStore } from "../dialog-store";
import { useTags } from "../queries";

const ROW_HEIGHT = 36;

interface TagListProps {
  repoPath: string;
}

export function TagList({ repoPath }: TagListProps) {
  const { t } = useTranslation();
  const tags = useTags(repoPath);
  const showDialog = useTagDialogStore((state) => state.show);
  const [query, setQuery] = useState("");
  const showSkeleton = useSkeletonVisible(tags.isPending);

  const visibleTags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = tags.data ?? [];
    return needle ? all.filter((tag) => tag.name.toLowerCase().includes(needle)) : all;
  }, [tags.data, query]);

  function menuFor(tag: Tag): ContextMenuEntry[] {
    return [
      { label: t("tags.menu.push"), icon: <CloudUpload className="size-4" />, onSelect: () => void pushLocalTag(repoPath, tag.name) },
      { label: t("tags.menu.copyName"), icon: <Copy className="size-4" />, onSelect: () => void navigator.clipboard.writeText(tag.name) },
      { kind: "separator" },
      {
        label: t("tags.menu.delete"),
        icon: <Trash2 className="size-4" />,
        destructive: true,
        onSelect: () => showDialog({ kind: "delete", name: tag.name }),
      },
      {
        label: t("tags.menu.deleteRemote"),
        icon: <Trash2 className="size-4" />,
        destructive: true,
        onSelect: () => showDialog({ kind: "deleteRemote", name: tag.name }),
      },
    ];
  }

  if (showSkeleton) {
    return <SkeletonRows count={6} rowHeight={ROW_HEIGHT} className="flex-1 px-2" />;
  }
  if (tags.isPending) {
    return <div className="flex-1" />;
  }
  if (tags.isError) {
    const description = describeError(tags.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void tags.refetch()} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="px-3">
        <SearchInput label={t("tags.search")} value={query} onValueChange={setQuery} />
      </div>
      {visibleTags.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="size-5" />}
          title={query ? t("tags.noResults") : t("tags.empty.title")}
          description={query ? undefined : t("tags.empty.description")}
        />
      ) : (
        <VirtualList
          items={visibleTags}
          rowHeight={ROW_HEIGHT}
          ariaLabel={t("tags.listLabel")}
          getKey={(tag) => tag.name}
          renderRow={(tag) => (
            <div
              onContextMenu={(event) => openContextMenu(event, menuFor(tag))}
              title={tag.message ?? tag.name}
              className={cn(
                "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] items-center gap-2 rounded-md px-2.5 transition-colors duration-150 hover:bg-subtle",
              )}
            >
              <TagIcon className="size-3.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tag.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted">{tag.targetHash.slice(0, 7)}</span>
            </div>
          )}
        />
      )}
    </div>
  );
}
