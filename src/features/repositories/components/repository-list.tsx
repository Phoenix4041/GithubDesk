import { FolderGit2, SearchX, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { EmptyState } from "@/shared/ui/empty-state";
import { IconButton } from "@/shared/ui/icon-button";
import { SearchInput } from "@/shared/ui/search-input";
import { Button } from "@/shared/ui/button";
import { VirtualList } from "@/shared/ui/virtual-list";
import { openRepositoryFromPath } from "../actions";
import { useRepositoriesStore } from "../store";
import type { RecentRepository } from "../store";

const ROW_HEIGHT = 46;

interface RepositoryListProps {
  className?: string;
}

export function RepositoryList({ className }: RepositoryListProps) {
  const { t } = useTranslation();
  const recents = useRepositoriesStore((state) => state.recents);
  const activePath = useRepositoriesStore((state) => state.activePath);
  const forget = useRepositoriesStore((state) => state.forget);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return recents;
    }
    return recents.filter(
      (repository) => repository.name.toLowerCase().includes(needle) || repository.path.toLowerCase().includes(needle),
    );
  }, [recents, query]);

  function renderRow(repository: RecentRepository) {
    const isActive = repository.path === activePath;
    return (
      <div
        className={cn(
          "group mx-1.5 flex h-[calc(100%-2px)] items-center gap-1 rounded-md pr-1 transition-colors duration-150",
          isActive ? "bg-accent-soft" : "hover:bg-subtle",
        )}
      >
        <button
          type="button"
          aria-current={isActive ? "true" : undefined}
          onClick={() => void openRepositoryFromPath(repository.path)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-left"
        >
          <FolderGit2 className={cn("size-4 shrink-0", isActive ? "text-accent" : "text-muted")} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium">{repository.name}</span>
            <span className="truncate text-[11px] text-muted" title={repository.path}>
              {repository.path}
            </span>
          </span>
        </button>
        <IconButton
          label={t("repositories.forget", { name: repository.name })}
          onClick={() => forget(repository.path)}
          className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </IconButton>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div className="px-3">
        <SearchInput label={t("repositories.search")} value={query} onValueChange={setQuery} />
      </div>
      {recents.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="size-5" />}
          title={t("repositories.empty.title")}
          description={t("repositories.empty.description")}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={t("repositories.noResults.title")}
          description={t("repositories.noResults.description")}
          action={
            <Button size="sm" onClick={() => setQuery("")}>
              {t("common.clearSearch")}
            </Button>
          }
        />
      ) : (
        <VirtualList
          items={visible}
          rowHeight={ROW_HEIGHT}
          getKey={(repository) => repository.path}
          renderRow={renderRow}
          ariaLabel={t("repositories.title")}
        />
      )}
    </div>
  );
}
