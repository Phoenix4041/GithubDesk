import { create } from "zustand";

interface SigningDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useSigningDialogStore = create<SigningDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
