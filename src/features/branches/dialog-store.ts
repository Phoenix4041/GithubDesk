import { create } from "zustand";

export interface BranchStartPoint {
  hash: string;
  label: string;
}

export type BranchDialog =
  | { kind: "create"; startPoint?: BranchStartPoint }
  | { kind: "rename"; name: string }
  | { kind: "delete"; name: string; force: boolean };

interface BranchDialogState {
  dialog: BranchDialog | null;
  show: (dialog: BranchDialog) => void;
  hide: () => void;
}

export const useBranchDialogStore = create<BranchDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
