import { create } from "zustand";

interface StackDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useStackDialogStore = create<StackDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
