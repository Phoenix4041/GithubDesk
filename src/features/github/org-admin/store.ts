import { create } from "zustand";

export interface OrgTarget {
  accountId: string;
  org: string;
}

interface OrgDialogState {
  target: OrgTarget | null;
  show: (target: OrgTarget) => void;
  hide: () => void;
}

export const useOrgDialogStore = create<OrgDialogState>((set) => ({
  target: null,
  show: (target) => set({ target }),
  hide: () => set({ target: null }),
}));
