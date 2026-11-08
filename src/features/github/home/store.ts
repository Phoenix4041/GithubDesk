import { create } from "zustand";

interface GithubHomeDialogState {
  createOpen: boolean;
  publishOpen: boolean;
  showCreate: () => void;
  hideCreate: () => void;
  showPublish: () => void;
  hidePublish: () => void;
}

export const useGithubHomeDialogStore = create<GithubHomeDialogState>((set) => ({
  createOpen: false,
  publishOpen: false,
  showCreate: () => set({ createOpen: true }),
  hideCreate: () => set({ createOpen: false }),
  showPublish: () => set({ publishOpen: true }),
  hidePublish: () => set({ publishOpen: false }),
}));
