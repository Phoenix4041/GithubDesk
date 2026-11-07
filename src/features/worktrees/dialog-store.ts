import { create } from "zustand";
import type { Worktree } from "@/shared/types/git";

export type WorktreeDialog =
  | { kind: "create"; branch?: string }
  | { kind: "remove"; worktree: Worktree }
  | { kind: "lock"; worktree: Worktree };

interface WorktreeDialogState {
  dialog: WorktreeDialog | null;
  show: (dialog: WorktreeDialog) => void;
  hide: () => void;
}

export const useWorktreeDialogStore = create<WorktreeDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
