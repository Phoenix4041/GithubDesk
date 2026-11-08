import { create } from "zustand";

interface RescueDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useRescueDialogStore = create<RescueDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
