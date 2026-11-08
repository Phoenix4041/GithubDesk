import { create } from "zustand";

interface CleanupDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useCleanupDialogStore = create<CleanupDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
