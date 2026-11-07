import { create } from "zustand";

export interface RebaseTarget {
  base: string;
  label: string;
}

interface RebaseDialogState {
  target: RebaseTarget | null;
  show: (target: RebaseTarget) => void;
  hide: () => void;
}

export const useRebaseDialogStore = create<RebaseDialogState>((set) => ({
  target: null,
  show: (target) => set({ target }),
  hide: () => set({ target: null }),
}));
