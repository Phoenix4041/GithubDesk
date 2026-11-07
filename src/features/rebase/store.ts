import { create } from "zustand";

export interface RebaseTarget {
  base: string;
  label: string;
}

interface RebaseDialogState {
  target: RebaseTarget | null;
  show: (target: RebaseTarget) => void;
  hide: () => void;
}

export const useRebaseDialogStore = create<RebaseDialogState>((set) => ({
  target: null,
  show: (target) => set({ target }),
  hide: () => set({ target: null }),
}));

interface RebaseOntoState {
  target: string | null;
  choosing: boolean;
  show: (target: string) => void;
  choose: () => void;
  hide: () => void;
}

export const useRebaseOntoStore = create<RebaseOntoState>((set) => ({
  target: null,
  choosing: false,
  show: (target) => set({ target, choosing: false }),
  choose: () => set({ target: null, choosing: true }),
  hide: () => set({ target: null, choosing: false }),
}));
