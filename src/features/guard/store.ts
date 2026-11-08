import { create } from "zustand";
import type { Finding } from "./api";

export type GuardChoice = "commit" | "cancel" | "unstage";

export interface GuardDecision {
  choice: GuardChoice;
  findings: Finding[];
}

interface GuardRequest {
  repoPath: string;
  findings: Finding[];
  resolve: (decision: GuardDecision) => void;
}

interface GuardState {
  request: GuardRequest | null;
  ask: (repoPath: string, findings: Finding[]) => Promise<GuardDecision>;
  setFindings: (findings: Finding[]) => void;
  finish: (choice: GuardChoice) => void;
}

export const useGuardStore = create<GuardState>((set, get) => ({
  request: null,
  ask: (repoPath, findings) =>
    new Promise<GuardDecision>((resolve) => {
      const previous = get().request;
      previous?.resolve({ choice: "cancel", findings: previous.findings });
      set({ request: { repoPath, findings, resolve } });
    }),
  setFindings: (findings) => set((state) => (state.request ? { request: { ...state.request, findings } } : state)),
  finish: (choice) => {
    const current = get().request;
    set({ request: null });
    current?.resolve({ choice, findings: current.findings });
  },
}));
