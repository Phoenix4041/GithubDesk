import { create } from "zustand";

export type RepositoryDialog = "create" | "clone";

export interface ClonePreset {
  url: string;
  accountId: string | null;
}

interface RepositoryDialogState {
  dialog: RepositoryDialog | null;
  clonePreset: ClonePreset | null;
  show: (dialog: RepositoryDialog, clonePreset?: ClonePreset) => void;
  hide: () => void;
}

export const useRepositoryDialogStore = create<RepositoryDialogState>((set) => ({
  dialog: null,
  clonePreset: null,
  show: (dialog, clonePreset = undefined) => set({ dialog, clonePreset: clonePreset ?? null }),
  hide: () => set({ dialog: null, clonePreset: null }),
}));
