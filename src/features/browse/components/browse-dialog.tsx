import { FileSearch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { useBrowseDialogStore } from "../store";
import type { BrowseTarget } from "../store";
import { FileTree } from "./file-tree";
import { FileViewer } from "./file-viewer";

function BrowseBody({ repoPath, target }: { repoPath: string; target: BrowseTarget }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="flex h-[60vh] min-h-80 overflow-hidden rounded-lg border border-line">
      <div className="w-56 shrink-0 overflow-auto border-r border-line py-1">
        <FileTree
          repoPath={repoPath}
          revision={target.revision}
          folder={null}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleFolder={toggleFolder}
          onSelectFile={setSelectedPath}
        />
      </div>
      {selectedPath ? (
        <FileViewer key={selectedPath} repoPath={repoPath} revision={target.revision} label={target.label} path={selectedPath} />
      ) : (
        <div className="grid min-w-0 flex-1 place-items-center">
          <EmptyState icon={<FileSearch className="size-5" />} title={t("browse.pick.title")} description={t("browse.pick.description")} />
        </div>
      )}
    </div>
  );
}

export function BrowseDialog({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const target = useBrowseDialogStore((state) => state.target);
  const hide = useBrowseDialogStore((state) => state.hide);

  if (!target) {
    return null;
  }
  return (
    <Dialog
      open
      title={t("browse.title", { revision: target.label })}
      description={t("browse.description")}
      onClose={hide}
      width="lg"
      footer={<Button onClick={hide}>{t("common.close")}</Button>}
    >
      <BrowseBody key={`${repoPath}:${target.revision}`} repoPath={repoPath} target={target} />
    </Dialog>
  );
}
