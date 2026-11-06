import { useTranslation } from "react-i18next";
import { ChangeKindBadge } from "@/features/changes/components/change-badge";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { splitPath } from "@/shared/lib/paths";
import type { CommitFile } from "@/shared/types/git";
import { Skeleton } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { useCommitDetail, useCommitFiles } from "../queries";
import { useHistoryStore } from "../store";

const FILE_ROW_HEIGHT = 28;

interface CommitDetailsProps {
  repoPath: string;
  hash: string;
}

export function CommitDetails({ repoPath, hash }: CommitDetailsProps) {
  const { t, i18n } = useTranslation();
  const detail = useCommitDetail(repoPath, hash);
  const files = useCommitFiles(repoPath, hash);
  const selectedFile = useHistoryStore((state) => state.selectedFile);
  const selectFile = useHistoryStore((state) => state.selectFile);

  function renderFile(file: CommitFile) {
    const { directory, fileName } = splitPath(file.path);
    const isSelected = selectedFile?.path === file.path;
    return (
      <button
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => selectFile({ path: file.path, oldPath: file.oldPath })}
        title={file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}
        className={cn(
          "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors duration-150",
          isSelected ? "bg-accent-soft" : "hover:bg-subtle",
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

  const commit = detail.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
        {commit ? (
          <>
            <h3 className="selectable text-[13px] font-semibold">{commit.summary.subject}</h3>
            {commit.body ? (
              <p className="selectable max-h-24 overflow-y-auto text-xs whitespace-pre-wrap text-muted">{commit.body}</p>
            ) : null}
            <p className="text-[11px] text-muted">
              {commit.summary.authorName} &middot; {formatDateTime(commit.summary.authorTime, i18n.language)} &middot;{" "}
              <span className="selectable font-mono">{commit.summary.shortHash}</span>
            </p>
          </>
        ) : (
          <>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </>
        )}
      </div>
      <div className="px-4 py-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {t("history.changedFiles", { count: files.data?.length ?? 0 })}
      </div>
      {files.data ? (
        <VirtualList
          items={files.data}
          rowHeight={FILE_ROW_HEIGHT}
          ariaLabel={t("history.filesLabel")}
          getKey={(file) => file.path}
          renderRow={renderFile}
        />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
    </div>
  );
}
