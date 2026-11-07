import { create } from "zustand";

interface MergeDialogState {
  source: string | null;
  choosing: boolean;
  show: (source: string) => void;
  choose: () => void;
  hide: () => void;
}

export const useMergeDialogStore = create<MergeDialogState>((set) => ({
  source: null,
  choosing: false,
  show: (source) => set({ source, choosing: false }),
  choose: () => set({ source: null, choosing: true }),
  hide: () => set({ source: null, choosing: false }),
}));
