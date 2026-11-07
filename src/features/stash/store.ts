import { create } from "zustand";
import type { Stash } from "@/shared/types/git";

export interface SelectedStashFile {
  path: string;
  oldPath: string | null;
}

interface StashState {
  selectedHash: string | null;
  selectedFile: SelectedStashFile | null;
  select: (hash: string | null) => void;
  selectFile: (file: SelectedStashFile | null) => void;
}

export const useStashStore = create<StashState>((set) => ({
  selectedHash: null,
  selectedFile: null,
  select: (selectedHash) => set({ selectedHash, selectedFile: null }),
  selectFile: (selectedFile) => set({ selectedFile }),
}));

export type StashDialog =
  | { kind: "save" }
  | { kind: "drop"; stash: Stash }
  | { kind: "branch"; stash: Stash };

interface StashDialogState {
  dialog: StashDialog | null;
  show: (dialog: StashDialog) => void;
  hide: () => void;
}

export const useStashDialogStore = create<StashDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
