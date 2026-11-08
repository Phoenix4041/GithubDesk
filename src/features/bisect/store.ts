import { create } from "zustand";

export interface BisectPreset {
  bad?: string;
  good?: string;
}

interface BisectDialogState {
  open: boolean;
  preset: BisectPreset;
  show: (preset?: BisectPreset) => void;
  hide: () => void;
}

export const useBisectDialogStore = create<BisectDialogState>((set) => ({
  open: false,
  preset: {},
  show: (preset = {}) => set({ open: true, preset }),
  hide: () => set({ open: false, preset: {} }),
}));
