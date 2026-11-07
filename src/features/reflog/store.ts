import { create } from "zustand";
import type { ReflogEntry } from "@/shared/types/git";

export type ReflogDialog = { kind: "list" } | { kind: "undo" } | { kind: "restore"; entry: ReflogEntry };

interface ReflogDialogState {
  dialog: ReflogDialog | null;
  show: (dialog: ReflogDialog) => void;
  hide: () => void;
}

export const useReflogDialogStore = create<ReflogDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
