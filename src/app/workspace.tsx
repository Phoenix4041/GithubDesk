import { Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BranchDialogs } from "@/features/branches/components/branch-dialogs";
import { ChangesDiffPanel } from "@/features/changes/components/changes-diff-panel";
import { ChangesView } from "@/features/changes/components/changes-view";
import { useStatus } from "@/features/changes/queries";
import { useChangesStore } from "@/features/changes/store";
import { CommitDialogs } from "@/features/history/components/commit-dialogs";
import { BlamePanel } from "@/features/blame/components/blame-panel";
import { ActionsPanel, RunDetailPanel } from "@/features/github/actions/components/actions-panels";
import { IssueDetailPanel, IssuesPanel } from "@/features/github/issues/components/issues-panels";
import { PullDetailPanel, PullsPanel } from "@/features/github/pulls/components/pulls-panels";
import { useGithubGitAuth } from "@/features/github/use-github-repo";
import { useBlameStore } from "@/features/blame/store";
import { CompareDiffPanel } from "@/features/compare/components/compare-diff-panel";
import { ComparePanel } from "@/features/compare/components/compare-panel";
import { useCompareStore } from "@/features/compare/store";
import { HistoryDiffPanel } from "@/features/history/components/history-diff-panel";
import { HistoryView } from "@/features/history/components/history-view";
import { useHistoryStore } from "@/features/history/store";
import { useRepoWatcher } from "@/features/repositories/use-repo-watcher";
import { CHANGES_WIDTH_RANGE, SIDEBAR_WIDTH_RANGE, useSettingsStore } from "@/features/settings/store";
import { RebaseOntoDialog } from "@/features/rebase/components/rebase-onto-dialog";
import { RebaseDialog } from "@/features/rebase/components/rebase-dialog";
import { ReflogDialogs } from "@/features/reflog/components/reflog-dialogs";
import { StashDialogs } from "@/features/stash/components/stash-dialogs";
import { StashDiffPanel } from "@/features/stash/components/stash-diff-panel";
import { StashPanel } from "@/features/stash/components/stash-panel";
import { useStashStore } from "@/features/stash/store";
import { ForcePushDialog } from "@/features/sync/components/force-push-dialog";
import { GitignoreDialog } from "@/features/gitignore/components/gitignore-dialog";
import { BisectBanner } from "@/features/bisect/components/bisect-banner";
import { CleanupDialog } from "@/features/cleanup/components/cleanup-dialog";
import { BisectDialog } from "@/features/bisect/components/bisect-dialog";
import { MergeDialog } from "@/features/merge/components/merge-dialog";
import { PatchDialog } from "@/features/patches/components/patch-dialog";
import { ApplyProfileDialog } from "@/features/profiles/components/apply-profile-dialog";
import { ProfileHint } from "@/features/profiles/components/profile-hint";
import { SigningDialog } from "@/features/signing/components/signing-dialog";
import { SubmoduleDialogs } from "@/features/submodules/components/submodule-dialogs";
import { TagDialogs } from "@/features/tags/components/tag-dialogs";
import { useTerminalStore } from "@/features/terminal/store";
import { WorktreeDialogs } from "@/features/worktrees/components/worktree-dialogs";
import { CommandError } from "@/shared/lib/tauri-client";
import { useUiStore } from "@/shared/lib/ui-store";
import { ResizeHandle } from "@/shared/ui/resize-handle";
import { RepositoryUnavailable } from "./components/repository-unavailable";
import { Sidebar } from "./components/sidebar";
import { Toolbar } from "./components/toolbar";
import { WorkspaceTabs } from "./components/workspace-tabs";

const TerminalPanel = lazy(() =>
  import("@/features/terminal/components/terminal-panel").then((module) => ({ default: module.TerminalPanel })),
);

interface WorkspaceProps {
  repoPath: string;
}

export function Workspace({ repoPath }: WorkspaceProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const tab = useUiStore((state) => state.tab);
  const terminalMounted = useTerminalStore((state) => state.mounted);
  const blameOpen = useBlameStore((state) => state.target !== null);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const changesWidth = useSettingsStore((state) => state.changesWidth);
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth);
  const setChangesWidth = useSettingsStore((state) => state.setChangesWidth);

  useRepoWatcher(repoPath);
  useGithubGitAuth(repoPath);

  useEffect(() => {
    useChangesStore.getState().reset();
    useHistoryStore.getState().reset();
    useStashStore.getState().select(null);
    useCompareStore.getState().close();
    useBlameStore.getState().close();
  }, []);

  if (status.isError && status.error instanceof CommandError && status.error.appError.kind === "notARepository") {
    return <RepositoryUnavailable repoPath={repoPath} error={status.error} onRetry={() => void status.refetch()} />;
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar repoPath={repoPath} />
      <div className="flex min-h-0 flex-1">
        <aside style={{ width: sidebarWidth }} className="shrink-0 overflow-hidden">
          <Sidebar repoPath={repoPath} />
        </aside>
        <ResizeHandle
          label={t("layout.resizeSidebar")}
          value={sidebarWidth}
          min={SIDEBAR_WIDTH_RANGE.min}
          max={SIDEBAR_WIDTH_RANGE.max}
          onChange={setSidebarWidth}
        />
        <section style={{ width: changesWidth }} className="flex shrink-0 flex-col bg-surface">
          <WorkspaceTabs repoPath={repoPath} />
          <BisectBanner repoPath={repoPath} />
          <ProfileHint repoPath={repoPath} />
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            {tab === "changes" ? <ChangesView repoPath={repoPath} /> : null}
            {tab === "history" ? <HistoryView repoPath={repoPath} /> : null}
            {tab === "stash" ? <StashPanel repoPath={repoPath} /> : null}
            {tab === "compare" ? <ComparePanel repoPath={repoPath} /> : null}
            {tab === "pulls" ? <PullsPanel repoPath={repoPath} /> : null}
            {tab === "issues" ? <IssuesPanel repoPath={repoPath} /> : null}
            {tab === "actions" ? <ActionsPanel repoPath={repoPath} /> : null}
          </div>
        </section>
        <ResizeHandle
          label={t("layout.resizeChanges")}
          value={changesWidth}
          min={CHANGES_WIDTH_RANGE.min}
          max={CHANGES_WIDTH_RANGE.max}
          onChange={setChangesWidth}
        />
        <main className="flex min-w-0 flex-1 flex-col bg-surface">
          {blameOpen ? <BlamePanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "changes" ? <ChangesDiffPanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "history" ? <HistoryDiffPanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "stash" ? <StashDiffPanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "compare" ? <CompareDiffPanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "pulls" ? <PullDetailPanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "issues" ? <IssueDetailPanel repoPath={repoPath} /> : null}
          {!blameOpen && tab === "actions" ? <RunDetailPanel repoPath={repoPath} /> : null}
        </main>
      </div>
      {terminalMounted ? (
        <Suspense fallback={null}>
          <TerminalPanel repoPath={repoPath} />
        </Suspense>
      ) : null}
      <BranchDialogs repoPath={repoPath} />
      <TagDialogs repoPath={repoPath} />
      <StashDialogs repoPath={repoPath} />
      <WorktreeDialogs repoPath={repoPath} />
      <SubmoduleDialogs repoPath={repoPath} />
      <SigningDialog repoPath={repoPath} />
      <MergeDialog repoPath={repoPath} />
      <PatchDialog repoPath={repoPath} />
      <BisectDialog repoPath={repoPath} />
      <CleanupDialog repoPath={repoPath} />
      <ApplyProfileDialog repoPath={repoPath} />
      <GitignoreDialog repoPath={repoPath} />
      <RebaseDialog repoPath={repoPath} />
      <RebaseOntoDialog repoPath={repoPath} />
      <ReflogDialogs repoPath={repoPath} />
      <CommitDialogs repoPath={repoPath} />
      <ForcePushDialog repoPath={repoPath} />
    </div>
  );
}
