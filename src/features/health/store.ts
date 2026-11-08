import { create } from "zustand";

interface HealthDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useHealthDialogStore = create<HealthDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
