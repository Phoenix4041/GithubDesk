import { create } from "zustand";

interface PatchDialogState {
  files: string[] | null;
  show: (files: string[]) => void;
  hide: () => void;
}

export const usePatchDialogStore = create<PatchDialogState>((set) => ({
  files: null,
  show: (files) => set({ files }),
  hide: () => set({ files: null }),
}));
