import { create } from "zustand";

export interface TagTarget {
  hash: string;
  label: string;
}

export type TagDialog =
  | { kind: "create"; target: TagTarget | null }
  | { kind: "delete"; name: string }
  | { kind: "deleteRemote"; name: string };

interface TagDialogState {
  dialog: TagDialog | null;
  show: (dialog: TagDialog) => void;
  hide: () => void;
}

export const useTagDialogStore = create<TagDialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));
