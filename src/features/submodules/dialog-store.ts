import { create } from "zustand";
import type { Submodule } from "@/shared/types/git";

export type SubmoduleDialog =
  | { kind: "add" }
  | { kind: "update"; submodule: Submodule | null }
  | { kind: "remove"; submodule: Submodule };

interface SubmoduleDialogState {
  dialog: SubmoduleDialog | null;
  show: (dialog: SubmoduleDialog) => void;
  hide: () => void;
}

export const useSubmoduleDialogStore = create<SubmoduleDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
