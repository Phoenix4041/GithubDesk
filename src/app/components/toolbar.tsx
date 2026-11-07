import { FolderGit2, GitBranch, Settings } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStatus } from "@/features/changes/queries";
import { GithubRepoChip } from "@/features/github/components/github-repo-chip";
import { ReflogButtons } from "@/features/reflog/components/reflog-buttons";
import { useRepositoriesStore } from "@/features/repositories/store";
import { SettingsDialog } from "@/features/settings/components/settings-dialog";
import { SyncButton } from "@/features/sync/components/sync-button";
import { IconButton } from "@/shared/ui/icon-button";

interface ToolbarProps {
  repoPath: string;
}

export function Toolbar({ repoPath }: ToolbarProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const recents = useRepositoriesStore((state) => state.recents);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const repositoryName = recents.find((recent) => recent.path === repoPath)?.name ?? repoPath;
  const branch = status.data?.branch;
  const branchLabel = branch
    ? branch.detached
      ? t("toolbar.detached")
      : (branch.head ?? t("toolbar.unknownBranch"))
    : "";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex min-w-0 items-center gap-2" title={repoPath}>
        <FolderGit2 className="size-4 shrink-0 text-muted" />
        <span className="truncate text-[13px] font-semibold">{repositoryName}</span>
      </div>
      {branch ? (
        <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-xs" aria-label={t("toolbar.currentBranch")}>
          <GitBranch className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium">{branchLabel}</span>
        </div>
      ) : null}
      <GithubRepoChip repoPath={repoPath} />
      <div className="ml-auto flex items-center gap-2">
        <ReflogButtons repoPath={repoPath} />
        <SyncButton repoPath={repoPath} />
        <IconButton label={t("settings.title")} onClick={() => setSettingsOpen(true)}>
          <Settings className="size-4" />
        </IconButton>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
