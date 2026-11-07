import { create } from "zustand";

export const TERMINAL_HEIGHT_RANGE = { min: 140, max: 640, initial: 280 };

interface TerminalState {
  open: boolean;
  mounted: boolean;
  height: number;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  setHeight: (height: number) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  open: false,
  mounted: false,
  height: TERMINAL_HEIGHT_RANGE.initial,
  toggle: () => set((state) => ({ open: !state.open, mounted: true })),
  show: () => set({ open: true, mounted: true }),
  hide: () => set({ open: false }),
  setHeight: (height) => set({ height }),
}));
