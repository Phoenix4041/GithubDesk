import { create } from "zustand";
import type { CommitSummary } from "@/shared/types/git";

export type CommitDialog =
  | { kind: "revertMerge"; commit: CommitSummary }
  | { kind: "resetHard"; commit: CommitSummary };

interface CommitDialogState {
  dialog: CommitDialog | null;
  show: (dialog: CommitDialog) => void;
  hide: () => void;
}

export const useCommitDialogStore = create<CommitDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
