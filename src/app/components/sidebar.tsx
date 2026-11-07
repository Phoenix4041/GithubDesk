import { Boxes, GitBranch, HardDrive, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BranchList } from "@/features/branches/components/branch-list";
import { useBranchDialogStore } from "@/features/branches/dialog-store";
import { useBranches } from "@/features/branches/queries";
import { LfsPanel } from "@/features/lfs/components/lfs-panel";
import { useLfsStatus } from "@/features/lfs/queries";
import { AddRepositoryMenu } from "@/features/repositories/components/add-repository-menu";
import { RepositoryList } from "@/features/repositories/components/repository-list";
import { StashList } from "@/features/stash/components/stash-list";
import { useSubmoduleDialogStore } from "@/features/submodules/dialog-store";
import { SubmoduleList } from "@/features/submodules/components/submodule-list";
import { useSubmodules } from "@/features/submodules/queries";
import { useStashes } from "@/features/stash/queries";
import { useStashDialogStore } from "@/features/stash/store";
import { useTagDialogStore } from "@/features/tags/dialog-store";
import { TagList } from "@/features/tags/components/tag-list";
import { useTags } from "@/features/tags/queries";
import { useWorktreeDialogStore } from "@/features/worktrees/dialog-store";
import { WorktreeList } from "@/features/worktrees/components/worktree-list";
import { useWorktrees } from "@/features/worktrees/queries";
import { cn } from "@/shared/lib/cn";
import { useUiStore } from "@/shared/lib/ui-store";
import type { SidebarTab } from "@/shared/lib/ui-store";
import { IconButton } from "@/shared/ui/icon-button";
import { Menu } from "@/shared/ui/menu";

interface SidebarProps {
  repoPath: string;
}

export function Sidebar({ repoPath }: SidebarProps) {
  const { t } = useTranslation();
  const showBranchDialog = useBranchDialogStore((state) => state.show);
  const showTagDialog = useTagDialogStore((state) => state.show);
  const showStashDialog = useStashDialogStore((state) => state.show);
  const sidebarTab = useUiStore((state) => state.sidebarTab);
  const setSidebarTab = useUiStore((state) => state.setSidebarTab);
  const branches = useBranches(repoPath);
  const tags = useTags(repoPath);
  const stashes = useStashes(repoPath);
  const worktrees = useWorktrees(repoPath, sidebarTab === "worktrees");
  const submodules = useSubmodules(repoPath, sidebarTab === "submodules");
  const lfs = useLfsStatus(repoPath, sidebarTab === "lfs");
  const showWorktreeDialog = useWorktreeDialogStore((state) => state.show);
  const showSubmoduleDialog = useSubmoduleDialogStore((state) => state.show);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [sidebarTab]);

  const tabs: Array<{ id: SidebarTab; label: string; count: number }> = [
    { id: "branches", label: t("branches.title"), count: branches.data?.filter((branch) => !branch.isRemote).length ?? 0 },
    { id: "tags", label: t("tags.title"), count: tags.data?.length ?? 0 },
    { id: "stashes", label: t("stash.title"), count: stashes.data?.length ?? 0 },
  ];
  const extraTabs: Array<{ id: SidebarTab; label: string; count: number }> = [
    { id: "worktrees", label: t("worktrees.title"), count: Math.max((worktrees.data?.length ?? 1) - 1, 0) },
    { id: "submodules", label: t("submodules.title"), count: submodules.data?.length ?? 0 },
    { id: "lfs", label: t("lfs.title"), count: lfs.data?.files.length ?? 0 },
  ];
  const activeExtra = extraTabs.find((item) => item.id === sidebarTab);
  if (activeExtra) {
    tabs.push(activeExtra);
  }

  return (
    <nav className="flex h-full min-h-0 flex-col bg-canvas" aria-label={t("sidebar.label")}>
      <section className="flex max-h-[42%] min-h-[170px] flex-col gap-2 pt-3">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t("repositories.title")}</h2>
          <AddRepositoryMenu />
        </div>
        <RepositoryList />
      </section>
      <section className="flex min-h-0 flex-1 flex-col gap-2 border-t border-line pt-2">
        <div className="flex items-center justify-between gap-2 px-3">
          <div
            ref={strip}
            role="tablist"
            aria-label={t("sidebar.sectionsLabel")}
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hidden"
          >
            {tabs.map((item) => {
              const selected = item.id === sidebarTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSidebarTab(item.id)}
                  className={cn(
                    "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors duration-150",
                    selected ? "bg-subtle text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                  {selected && item.count > 0 ? <span className="rounded-full bg-canvas px-1.5 py-px text-[10px] tabular-nums">{item.count}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center">
            <Menu
              label={t("sidebar.moreSections")}
              trigger={<MoreHorizontal className="size-4" />}
              items={[
                { label: t("worktrees.title"), icon: <GitBranch className="size-4" />, onSelect: () => setSidebarTab("worktrees") },
                { label: t("submodules.title"), icon: <Boxes className="size-4" />, onSelect: () => setSidebarTab("submodules") },
              { label: t("lfs.title"), icon: <HardDrive className="size-4" />, onSelect: () => setSidebarTab("lfs") },
              ]}
            />
            {sidebarTab === "branches" ? (
              <IconButton label={t("branches.new")} onClick={() => showBranchDialog({ kind: "create" })}>
                <Plus className="size-4" />
              </IconButton>
            ) : null}
            {sidebarTab === "tags" ? (
              <IconButton label={t("tags.new")} onClick={() => showTagDialog({ kind: "create", target: null })}>
                <Plus className="size-4" />
              </IconButton>
            ) : null}
            {sidebarTab === "stashes" ? (
              <IconButton label={t("stash.new")} onClick={() => showStashDialog({ kind: "save" })}>
                <Plus className="size-4" />
              </IconButton>
            ) : null}
            {sidebarTab === "worktrees" ? (
              <IconButton label={t("worktrees.new")} onClick={() => showWorktreeDialog({ kind: "create" })}>
                <Plus className="size-4" />
              </IconButton>
            ) : null}
            {sidebarTab === "submodules" ? (
              <IconButton label={t("submodules.add")} onClick={() => showSubmoduleDialog({ kind: "add" })}>
                <Plus className="size-4" />
              </IconButton>
            ) : null}
          </div>
        </div>
        {sidebarTab === "branches" ? <BranchList repoPath={repoPath} /> : null}
        {sidebarTab === "tags" ? <TagList repoPath={repoPath} /> : null}
        {sidebarTab === "stashes" ? <StashList repoPath={repoPath} /> : null}
        {sidebarTab === "worktrees" ? <WorktreeList repoPath={repoPath} /> : null}
        {sidebarTab === "submodules" ? <SubmoduleList repoPath={repoPath} /> : null}
        {sidebarTab === "lfs" ? <LfsPanel repoPath={repoPath} /> : null}
      </section>
    </nav>
  );
}
