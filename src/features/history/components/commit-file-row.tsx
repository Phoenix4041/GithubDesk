import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChangeKindBadge } from "@/features/changes/components/change-badge";
import { cn } from "@/shared/lib/cn";
import { splitPath } from "@/shared/lib/paths";
import type { CommitFile } from "@/shared/types/git";

interface CommitFileRowProps {
  file: CommitFile;
  selected: boolean;
  onSelect: (file: CommitFile) => void;
  onContextMenu?: (file: CommitFile, event: ReactMouseEvent) => void;
}

export function CommitFileRow({ file, selected, onSelect, onContextMenu }: CommitFileRowProps) {
  const { t } = useTranslation();
  const { directory, fileName } = splitPath(file.path);
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(file)}
      onContextMenu={onContextMenu ? (event) => onContextMenu(file, event) : undefined}
      title={file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}
      className={cn(
        "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors duration-150",
        selected ? "bg-accent-soft" : "hover:bg-subtle",
      )}
    >
      <ChangeKindBadge kind={file.status} label={t(`changes.kind.${file.status}`)} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="shrink-0 text-[13px] font-medium">{fileName}</span>
        <span className="truncate text-[11px] text-muted">{directory}</span>
      </span>
    </button>
  );
}
