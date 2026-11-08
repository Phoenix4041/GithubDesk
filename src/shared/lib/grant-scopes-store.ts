import { create } from "zustand";

export interface GrantRequest {
  accountId: string | null;
  scopes: string[];
  capabilityIds: string[];
}

interface GrantScopesState {
  request: GrantRequest | null;
  show: (request?: Partial<GrantRequest>) => void;
  hide: () => void;
}

export const useGrantScopesStore = create<GrantScopesState>((set) => ({
  request: null,
  show: (request = {}) =>
    set({
      request: {
        accountId: request.accountId ?? null,
        scopes: request.scopes ?? [],
        capabilityIds: request.capabilityIds ?? [],
      },
    }),
  hide: () => set({ request: null }),
}));
