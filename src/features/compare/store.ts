import { create } from "zustand";

export type CompareView = "files" | "headCommits" | "baseCommits";

export interface SelectedCompareFile {
  path: string;
  oldPath: string | null;
}

interface CompareState {
  base: string | null;
  head: string | null;
  view: CompareView;
  selectedFile: SelectedCompareFile | null;
  open: (base: string, head: string) => void;
  setBase: (base: string) => void;
  setHead: (head: string) => void;
  swap: () => void;
  setView: (view: CompareView) => void;
  selectFile: (file: SelectedCompareFile | null) => void;
  close: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  base: null,
  head: null,
  view: "files",
  selectedFile: null,
  open: (base, head) => set({ base, head, view: "files", selectedFile: null }),
  setBase: (base) => set({ base, selectedFile: null }),
  setHead: (head) => set({ head, selectedFile: null }),
  swap: () => set((state) => ({ base: state.head, head: state.base, selectedFile: null })),
  setView: (view) => set({ view }),
  selectFile: (selectedFile) => set({ selectedFile }),
  close: () => set({ base: null, head: null, view: "files", selectedFile: null }),
}));
