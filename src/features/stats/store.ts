import { create } from "zustand";

interface StatsDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useStatsDialogStore = create<StatsDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
