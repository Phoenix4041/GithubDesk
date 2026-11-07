import { create } from "zustand";

interface GitignoreDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useGitignoreDialogStore = create<GitignoreDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
