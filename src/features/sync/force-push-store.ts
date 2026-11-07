import { create } from "zustand";

interface ForcePushState {
  repoPath: string | null;
  show: (repoPath: string) => void;
  hide: () => void;
}

export const useForcePushStore = create<ForcePushState>((set) => ({
  repoPath: null,
  show: (repoPath) => set({ repoPath }),
  hide: () => set({ repoPath: null }),
}));
