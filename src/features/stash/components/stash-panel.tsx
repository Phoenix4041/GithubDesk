import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommitFileRow } from "@/features/history/components/commit-file-row";
import { useUiStore } from "@/shared/lib/ui-store";
import { formatDateTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { applyStashEntry } from "../actions";
import { useStashFiles, useStashes } from "../queries";
import { useStashDialogStore, useStashStore } from "../store";

const FILE_ROW_HEIGHT = 28;

interface StashPanelProps {
  repoPath: string;
}

export function StashPanel({ repoPath }: StashPanelProps) {
  const { t, i18n } = useTranslation();
  const stashes = useStashes(repoPath);
  const selectedHash = useStashStore((state) => state.selectedHash);
  const selectedFile = useStashStore((state) => state.selectedFile);
  const select = useStashStore((state) => state.select);
  const selectFile = useStashStore((state) => state.selectFile);
  const showDialog = useStashDialogStore((state) => state.show);
  const setTab = useUiStore((state) => state.setTab);
  const files = useStashFiles(repoPath, selectedHash);
  const [pending, setPending] = useState<"apply" | "pop" | null>(null);

  const stash = stashes.data?.find((candidate) => candidate.hash === selectedHash) ?? null;
  const stashMissing = stashes.data !== undefined && selectedHash !== null && stash === null;

  useEffect(() => {
    if (stashMissing) {
      select(null);
      setTab("changes");
    }
  }, [stashMissing, select, setTab]);

  useEffect(() => {
    if (!selectedFile && files.data && files.data.length > 0) {
      const first = files.data[0];
      if (first) {
        selectFile({ path: first.path, oldPath: first.oldPath });
      }
    }
  }, [files.data, selectedFile, selectFile]);

  async function run(pop: boolean) {
    if (!stash) {
      return;
    }
    setPending(pop ? "pop" : "apply");
    await applyStashEntry(repoPath, stash.hash, pop);
    setPending(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        {stash ? (
          <>
            <h3 className="selectable text-[13px] font-semibold">{stash.message}</h3>
            <p className="text-[11px] text-muted">
              {stash.branch ? `${t("stash.onBranch", { branch: stash.branch })} · ` : ""}
              {formatDateTime(stash.time, i18n.language)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={pending === "apply"} disabled={pending !== null} onClick={() => void run(false)}>
                {t("stash.panel.apply")}
              </Button>
              <Button size="sm" loading={pending === "pop"} disabled={pending !== null} onClick={() => void run(true)}>
                {t("stash.panel.pop")}
              </Button>
              <Button size="sm" disabled={pending !== null} onClick={() => showDialog({ kind: "branch", stash })}>
                {t("stash.panel.branch")}
              </Button>
              <Button size="sm" disabled={pending !== null} onClick={() => showDialog({ kind: "drop", stash })}>
                {t("stash.panel.drop")}
              </Button>
            </div>
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
