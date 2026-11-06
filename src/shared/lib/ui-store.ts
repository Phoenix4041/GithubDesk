import { create } from "zustand";

export type WorkspaceTab = "changes" | "history";

interface UiState {
  tab: WorkspaceTab;
  setTab: (tab: WorkspaceTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: "changes",
  setTab: (tab) => set({ tab }),
}));
