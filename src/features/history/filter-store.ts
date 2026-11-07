import { create } from "zustand";
import { EMPTY_FILTER_FIELDS } from "./history-query";
import type { HistoryFilterFields } from "./history-query";

interface HistoryFilterState extends HistoryFilterFields {
  graph: boolean;
  panelOpen: boolean;
  patch: (fields: Partial<HistoryFilterFields>) => void;
  clear: () => void;
  setGraph: (graph: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  showFileHistory: (path: string) => void;
}

export const useHistoryFilterStore = create<HistoryFilterState>((set) => ({
  ...EMPTY_FILTER_FIELDS,
  graph: false,
  panelOpen: false,
  patch: (fields) => set(fields),
  clear: () => set({ ...EMPTY_FILTER_FIELDS }),
  setGraph: (graph) => set({ graph }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  showFileHistory: (path) => set({ ...EMPTY_FILTER_FIELDS, path, follow: true, panelOpen: true }),
}));

export function selectFilterFields(state: HistoryFilterState): HistoryFilterFields {
  return {
    text: state.text,
    author: state.author,
    content: state.content,
    contentRegex: state.contentRegex,
    path: state.path,
    follow: state.follow,
    since: state.since,
    until: state.until,
    scope: state.scope,
  };
}
