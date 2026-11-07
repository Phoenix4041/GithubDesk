import { create } from "zustand";

export type WorkspaceTab = "changes" | "history" | "stash" | "compare" | "pulls" | "issues" | "actions";
export type SidebarTab = "branches" | "tags" | "stashes" | "worktrees" | "submodules" | "lfs";

interface UiState {
  tab: WorkspaceTab;
  sidebarTab: SidebarTab;
  settingsOpen: boolean;
  setTab: (tab: WorkspaceTab) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: "changes",
  sidebarTab: "branches",
  settingsOpen: false,
  setTab: (tab) => set({ tab }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
