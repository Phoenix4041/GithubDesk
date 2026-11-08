import { create } from "zustand";

interface AbsorbDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useAbsorbDialogStore = create<AbsorbDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
