import { create } from "zustand";

export type WorkspaceTab = "changes" | "history";
export type SidebarTab = "branches" | "tags";

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
