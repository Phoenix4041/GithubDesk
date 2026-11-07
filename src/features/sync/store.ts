import { create } from "zustand";
import type { Progress } from "@/shared/types/git";

export type SyncKind = "fetch" | "pull" | "push" | "forcePush" | "publish";

export interface SyncOperation {
  kind: SyncKind;
  repoPath: string;
  jobId: string;
  progress: Progress | null;
}

interface SyncState {
  operation: SyncOperation | null;
  begin: (operation: Omit<SyncOperation, "progress">) => void;
  report: (progress: Progress) => void;
  finish: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  operation: null,
  begin: (operation) => set({ operation: { ...operation, progress: null } }),
  report: (progress) =>
    set((state) => (state.operation ? { operation: { ...state.operation, progress } } : state)),
  finish: () => set({ operation: null }),
}));
