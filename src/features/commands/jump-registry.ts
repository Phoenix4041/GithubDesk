import { create } from "zustand";
import type { JumpTarget } from "./jump-model";

interface JumpRegistryState {
  sources: Record<string, JumpTarget[]>;
  setSource: (source: string, targets: JumpTarget[]) => void;
  clearSource: (source: string) => void;
}

export const useJumpRegistry = create<JumpRegistryState>((set) => ({
  sources: {},
  setSource: (source, targets) => set((state) => ({ sources: { ...state.sources, [source]: targets } })),
  clearSource: (source) =>
    set((state) => {
      const next = { ...state.sources };
      delete next[source];
      return { sources: next };
    }),
}));

export function flattenJumpTargets(sources: Record<string, JumpTarget[]>): JumpTarget[] {
  return Object.values(sources).flat();
}
