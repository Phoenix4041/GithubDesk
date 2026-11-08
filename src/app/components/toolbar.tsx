import { Brush, EyeOff, FolderGit2, FolderSearch, GitBranch, Settings, ShieldCheck, SquarePen, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStatus } from "@/features/changes/queries";
import { useCleanupDialogStore } from "@/features/cleanup/store";
import { openRepositoryInEditor, revealRepositoryPath } from "@/features/external/actions";
import { useGitignoreDialogStore } from "@/features/gitignore/store";
import { BranchChecksButton } from "@/features/github/checks/components/branch-checks-button";
import { GithubRepoChip } from "@/features/github/components/github-repo-chip";
import { PublishButton } from "@/features/github/home/components/publish-button";
import { NotificationsButton } from "@/features/github/notifications/components/notifications-button";
import { ProfileSwitcher } from "@/features/profiles/components/profile-switcher";
import { ReflogButtons } from "@/features/reflog/components/reflog-buttons";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSigningConfig } from "@/features/signing/queries";
import { useSigningDialogStore } from "@/features/signing/store";
import { SettingsDialog } from "@/features/settings/components/settings-dialog";
import { SyncButton } from "@/features/sync/components/sync-button";
import { useTerminalStore } from "@/features/terminal/store";
import { useUiStore } from "@/shared/lib/ui-store";
import { IconButton } from "@/shared/ui/icon-button";
import { Menu } from "@/shared/ui/menu";

interface ToolbarProps {
  repoPath: string;
}

export function Toolbar({ repoPath }: ToolbarProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const recents = useRepositoriesStore((state) => state.recents);
  const signing = useSigningConfig(repoPath);
  const showGitignore = useGitignoreDialogStore((state) => state.show);
  const showCleanup = useCleanupDialogStore((state) => state.show);
  const showSigning = useSigningDialogStore((state) => state.show);
  const terminalOpen = useTerminalStore((state) => state.open);
  const toggleTerminal = useTerminalStore((state) => state.toggle);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);

  const repositoryName = recents.find((recent) => recent.path === repoPath)?.name ?? repoPath;
  const branch = status.data?.branch;
  const branchLabel = branch
    ? branch.detached
      ? t("toolbar.detached")
      : (branch.head ?? t("toolbar.unknownBranch"))
    : "";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex min-w-0 items-center gap-1" title={repoPath}>
        <FolderGit2 className="size-4 shrink-0 text-muted" />
        <span className="truncate text-[13px] font-semibold">{repositoryName}</span>
        <Menu
          label={t("external.menu")}
          align="left"
          trigger={<SquarePen className="size-3.5" />}
          items={[
            {
              label: t("external.openRepository"),
              icon: <SquarePen className="size-4" />,
              onSelect: () => void openRepositoryInEditor(repoPath),
            },
            {
              label: t("external.revealRepository"),
              icon: <FolderSearch className="size-4" />,
              onSelect: () => void revealRepositoryPath(repoPath),
            },
            {
              label: t("gitignore.open"),
              icon: <EyeOff className="size-4" />,
              onSelect: showGitignore,
            },
            {
              label: t("cleanup.open"),
              icon: <Brush className="size-4" />,
              onSelect: showCleanup,
            },
          ]}
        />
      </div>
      {branch ? (
        <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-xs" aria-label={t("toolbar.currentBranch")}>
          <GitBranch className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium">{branchLabel}</span>
        </div>
      ) : null}
      <GithubRepoChip repoPath={repoPath} />
      <PublishButton repoPath={repoPath} />
      <BranchChecksButton repoPath={repoPath} />
      <div className="ml-auto flex items-center gap-2">
        <ReflogButtons repoPath={repoPath} />
        <SyncButton repoPath={repoPath} />
        <NotificationsButton />
        <ProfileSwitcher repoPath={repoPath} />
        <IconButton
          label={signing.data?.enabled ? t("signing.buttonOn") : t("signing.buttonOff")}
          active={signing.data?.enabled === true}
          onClick={showSigning}
        >
          <ShieldCheck className="size-4" />
        </IconButton>
        <IconButton label={t("terminal.toggle")} active={terminalOpen} onClick={toggleTerminal}>
          <Terminal className="size-4" />
        </IconButton>
        <IconButton label={t("settings.title")} onClick={() => setSettingsOpen(true)}>
          <Settings className="size-4" />
        </IconButton>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
