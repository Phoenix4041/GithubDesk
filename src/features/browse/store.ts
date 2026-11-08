import { create } from "zustand";

export interface BrowseTarget {
  revision: string;
  label: string;
}

interface BrowseDialogState {
  target: BrowseTarget | null;
  show: (target: BrowseTarget) => void;
  hide: () => void;
}

export const useBrowseDialogStore = create<BrowseDialogState>((set) => ({
  target: null,
  show: (target) => set({ target }),
  hide: () => set({ target: null }),
}));
