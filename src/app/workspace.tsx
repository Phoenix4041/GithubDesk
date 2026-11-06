import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BranchDialogs } from "@/features/branches/components/branch-dialogs";
import { ChangesDiffPanel } from "@/features/changes/components/changes-diff-panel";
import { ChangesView } from "@/features/changes/components/changes-view";
import { useStatus } from "@/features/changes/queries";
import { useChangesStore } from "@/features/changes/store";
import { HistoryDiffPanel } from "@/features/history/components/history-diff-panel";
import { HistoryView } from "@/features/history/components/history-view";
import { useHistoryStore } from "@/features/history/store";
import { useRepoWatcher } from "@/features/repositories/use-repo-watcher";
import { CHANGES_WIDTH_RANGE, SIDEBAR_WIDTH_RANGE, useSettingsStore } from "@/features/settings/store";
import { CommandError } from "@/shared/lib/tauri-client";
import { useUiStore } from "@/shared/lib/ui-store";
import { ResizeHandle } from "@/shared/ui/resize-handle";
import { RepositoryUnavailable } from "./components/repository-unavailable";
import { Sidebar } from "./components/sidebar";
import { Toolbar } from "./components/toolbar";
import { WorkspaceTabs } from "./components/workspace-tabs";

interface WorkspaceProps {
  repoPath: string;
}

export function Workspace({ repoPath }: WorkspaceProps) {
  const { t } = useTranslation();
  const status = useStatus(repoPath);
  const tab = useUiStore((state) => state.tab);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const changesWidth = useSettingsStore((state) => state.changesWidth);
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth);
  const setChangesWidth = useSettingsStore((state) => state.setChangesWidth);

  useRepoWatcher(repoPath);

  useEffect(() => {
    useChangesStore.getState().reset();
    useHistoryStore.getState().reset();
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
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            {tab === "changes" ? <ChangesView repoPath={repoPath} /> : <HistoryView repoPath={repoPath} />}
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
          {tab === "changes" ? <ChangesDiffPanel repoPath={repoPath} /> : <HistoryDiffPanel repoPath={repoPath} />}
        </main>
      </div>
      <BranchDialogs repoPath={repoPath} />
    </div>
  );
}
