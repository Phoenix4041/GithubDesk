import { create } from "zustand";

export type WorkspaceTab = "changes" | "history" | "stash" | "compare" | "pulls" | "issues" | "actions";
export type SidebarTab = "branches" | "tags" | "stashes";

interface UiState {
  tab: WorkspaceTab;
  sidebarTab: SidebarTab;
  setTab: (tab: WorkspaceTab) => void;
  setSidebarTab: (tab: SidebarTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: "changes",
  sidebarTab: "branches",
  setTab: (tab) => set({ tab }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
}));
