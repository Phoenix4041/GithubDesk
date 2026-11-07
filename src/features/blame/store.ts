import { create } from "zustand";

export interface BlameTarget {
  path: string;
  revision: string | null;
}

interface BlameState {
  target: BlameTarget | null;
  open: (target: BlameTarget) => void;
  close: () => void;
}

export const useBlameStore = create<BlameState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
