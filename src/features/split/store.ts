import { create } from "zustand";

interface SplitTarget {
  hash: string;
  shortHash: string;
  title: string;
}

interface SplitDialogState {
  target: SplitTarget | null;
  show: (target: SplitTarget) => void;
  hide: () => void;
}

export const useSplitDialogStore = create<SplitDialogState>((set) => ({
  target: null,
  show: (target) => set({ target }),
  hide: () => set({ target: null }),
}));
