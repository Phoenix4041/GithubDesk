import { create } from "zustand";

export interface SelectedCommitFile {
  path: string;
  oldPath: string | null;
}

interface HistoryState {
  selectedHash: string | null;
  selectedHashes: string[];
  selectedFile: SelectedCommitFile | null;
  selectCommit: (hash: string | null) => void;
  toggleCommit: (hash: string) => void;
  selectRange: (hash: string, orderedHashes: readonly string[]) => void;
  selectFile: (file: SelectedCommitFile | null) => void;
  reset: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  selectedHash: null,
  selectedHashes: [],
  selectedFile: null,
  selectCommit: (selectedHash) =>
    set({ selectedHash, selectedHashes: selectedHash ? [selectedHash] : [], selectedFile: null }),
  toggleCommit: (hash) =>
    set((state) => {
      const included = state.selectedHashes.includes(hash);
      const selectedHashes = included
        ? state.selectedHashes.filter((candidate) => candidate !== hash)
        : [...state.selectedHashes, hash];
      const selectedHash = included ? (selectedHashes[selectedHashes.length - 1] ?? null) : hash;
      return {
        selectedHashes,
        selectedHash,
        selectedFile: selectedHash === state.selectedHash ? state.selectedFile : null,
      };
    }),
  selectRange: (hash, orderedHashes) =>
    set((state) => {
      const anchorIndex = state.selectedHash ? orderedHashes.indexOf(state.selectedHash) : -1;
      const targetIndex = orderedHashes.indexOf(hash);
      if (anchorIndex === -1 || targetIndex === -1) {
        return { selectedHash: hash, selectedHashes: [hash], selectedFile: null };
      }
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return { selectedHash: hash, selectedHashes: orderedHashes.slice(start, end + 1), selectedFile: null };
    }),
  selectFile: (selectedFile) => set({ selectedFile }),
  reset: () => set({ selectedHash: null, selectedHashes: [], selectedFile: null }),
}));
