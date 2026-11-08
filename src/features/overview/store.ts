import { create } from "zustand";

interface OverviewDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useOverviewDialogStore = create<OverviewDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
