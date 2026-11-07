import { create } from "zustand";
import type { AppCommand } from "./command-model";

interface RegistryState {
  sources: Record<string, AppCommand[]>;
  setSource: (source: string, commands: AppCommand[]) => void;
  clearSource: (source: string) => void;
}

export const useCommandRegistry = create<RegistryState>((set) => ({
  sources: {},
  setSource: (source, commands) => set((state) => ({ sources: { ...state.sources, [source]: commands } })),
  clearSource: (source) =>
    set((state) => {
      const next = { ...state.sources };
      delete next[source];
      return { sources: next };
    }),
}));

export function flattenCommands(sources: Record<string, AppCommand[]>): AppCommand[] {
  return Object.values(sources).flat();
}
