import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  actions: ToastAction[];
}

interface ToastInput {
  kind: ToastKind;
  title: string;
  message?: string;
  actions?: ToastAction[];
}

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const DURATION_BY_KIND: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  error: 12000,
};

let nextToastId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (input) => {
    const id = nextToastId++;
    const toast: Toast = { id, kind: input.kind, title: input.title, message: input.message, actions: input.actions ?? [] };
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }));
    window.setTimeout(() => get().dismiss(id), DURATION_BY_KIND[input.kind]);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function showToast(input: ToastInput): number {
  return useToastStore.getState().push(input);
}
