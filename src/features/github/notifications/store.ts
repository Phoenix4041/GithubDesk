import { create } from "zustand";

interface NotificationDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useNotificationDialogStore = create<NotificationDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
