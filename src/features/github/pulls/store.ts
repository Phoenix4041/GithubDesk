import { create } from "zustand";

export type PullFilter = "open" | "closed" | "all";
export type PullDetailTab = "conversation" | "files";

interface PullState {
  filter: PullFilter;
  selected: number | null;
  detailTab: PullDetailTab;
  selectedFile: string | null;
  setFilter: (filter: PullFilter) => void;
  select: (number: number | null) => void;
  setDetailTab: (tab: PullDetailTab) => void;
  selectFile: (path: string | null) => void;
  reset: () => void;
}

export const usePullStore = create<PullState>((set) => ({
  filter: "open",
  selected: null,
  detailTab: "conversation",
  selectedFile: null,
  setFilter: (filter) => set({ filter, selected: null, selectedFile: null }),
  select: (selected) => set({ selected, detailTab: "conversation", selectedFile: null }),
  setDetailTab: (detailTab) => set({ detailTab }),
  selectFile: (selectedFile) => set({ selectedFile }),
  reset: () => set({ filter: "open", selected: null, detailTab: "conversation", selectedFile: null }),
}));
