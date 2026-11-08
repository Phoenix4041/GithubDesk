import { ChevronDown, ChevronRight, File, Folder, FolderGit2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import { Skeleton } from "@/shared/ui/skeleton";
import { useTree } from "../queries";

interface FileTreeProps {
  repoPath: string;
  revision: string;
  folder: string | null;
  depth: number;
  expanded: ReadonlySet<string>;
  selectedPath: string | null;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}

export function FileTree({ repoPath, revision, folder, depth, expanded, selectedPath, onToggleFolder, onSelectFile }: FileTreeProps) {
  const { t } = useTranslation();
  const tree = useTree(repoPath, revision, folder);
  const indent = { paddingLeft: 8 + depth * 14 };

  if (tree.isPending) {
    return (
      <div className="py-1 pr-2" style={indent}>
        <Skeleton className="h-4" />
      </div>
    );
  }
  if (tree.isError) {
    return (
      <p className="py-1 pr-2 text-[11px] text-danger" style={indent}>
        {describeError(tree.error).message}
      </p>
    );
  }
  if (tree.data.entries.length === 0) {
    return (
      <p className="py-1 pr-2 text-[11px] text-muted" style={indent}>
        {t("browse.emptyFolder")}
      </p>
    );
  }

  return (
    <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? t("browse.treeLabel") : undefined} className="flex flex-col">
      {tree.data.entries.map((entry) => {
        const rowClasses = "flex h-6 w-full min-w-0 items-center gap-1.5 pr-2 text-left text-xs";
        if (entry.kind === "folder") {
          const open = expanded.has(entry.path);
          return (
            <li key={entry.path} role="treeitem" aria-expanded={open} aria-selected={false}>
              <button type="button" className={cn(rowClasses, "cursor-pointer hover:bg-subtle")} style={indent} onClick={() => onToggleFolder(entry.path)}>
                {open ? <ChevronDown className="size-3.5 shrink-0 text-muted" /> : <ChevronRight className="size-3.5 shrink-0 text-muted" />}
                <Folder className="size-3.5 shrink-0 text-accent" />
                <span className="truncate">{entry.name}</span>
              </button>
              {open ? (
                <FileTree
                  repoPath={repoPath}
                  revision={revision}
                  folder={entry.path}
                  depth={depth + 1}
                  expanded={expanded}
                  selectedPath={selectedPath}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                />
              ) : null}
            </li>
          );
        }
        if (entry.kind === "submodule") {
          return (
            <li key={entry.path} role="treeitem" aria-selected={false} aria-disabled title={t("browse.submodule")}>
              <span className={cn(rowClasses, "text-muted")} style={indent}>
                <span className="size-3.5 shrink-0" />
                <FolderGit2 className="size-3.5 shrink-0" />
                <span className="truncate">{entry.name}</span>
              </span>
            </li>
          );
        }
        const selected = entry.path === selectedPath;
        return (
          <li key={entry.path} role="treeitem" aria-selected={selected}>
            <button
              type="button"
              className={cn(rowClasses, "cursor-pointer", selected ? "bg-accent-soft text-fg" : "hover:bg-subtle")}
              style={indent}
              onClick={() => onSelectFile(entry.path)}
            >
              <span className="size-3.5 shrink-0" />
              <File className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">{entry.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
