import { create } from "zustand";

export interface SelectedCommitFile {
  path: string;
  oldPath: string | null;
}

interface HistoryState {
  selectedHash: string | null;
  selectedFile: SelectedCommitFile | null;
  selectCommit: (hash: string | null) => void;
  selectFile: (file: SelectedCommitFile | null) => void;
  reset: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  selectedHash: null,
  selectedFile: null,
  selectCommit: (selectedHash) => set({ selectedHash, selectedFile: null }),
  selectFile: (selectedFile) => set({ selectedFile }),
  reset: () => set({ selectedHash: null, selectedFile: null }),
}));
