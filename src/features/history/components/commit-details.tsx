import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/shared/lib/format";
import { openContextMenu } from "@/shared/ui/context-menu";
import { Skeleton } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { useHistoryFilterStore } from "../filter-store";
import { useCommitDetail, useCommitFiles } from "../queries";
import { useHistoryStore } from "../store";
import { CommitFileRow } from "./commit-file-row";

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
  const showFileHistory = useHistoryFilterStore((state) => state.showFileHistory);

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
          renderRow={(file) => (
            <CommitFileRow
              file={file}
              selected={selectedFile?.path === file.path}
              onSelect={(chosen) => selectFile({ path: chosen.path, oldPath: chosen.oldPath })}
              onContextMenu={(chosen, event) =>
                openContextMenu(event, [
                  {
                    label: t("history.fileMenu.history"),
                    icon: <History className="size-4" />,
                    onSelect: () => showFileHistory(chosen.path),
                  },
                ])
              }
            />
          )}
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
