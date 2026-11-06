import { create } from "zustand";

export type RepositoryDialog = "create" | "clone";

interface RepositoryDialogState {
  dialog: RepositoryDialog | null;
  show: (dialog: RepositoryDialog) => void;
  hide: () => void;
}

export const useRepositoryDialogStore = create<RepositoryDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
