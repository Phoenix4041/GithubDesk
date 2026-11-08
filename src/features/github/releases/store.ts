import { create } from "zustand";

interface ReleaseState {
  selected: number | null;
  creating: boolean;
  select: (id: number | null) => void;
  startCreating: () => void;
  stopCreating: () => void;
}

export const useReleaseStore = create<ReleaseState>((set) => ({
  selected: null,
  creating: false,
  select: (selected) => set({ selected }),
  startCreating: () => set({ creating: true }),
  stopCreating: () => set({ creating: false }),
}));
