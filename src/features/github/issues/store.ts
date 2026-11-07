import { create } from "zustand";

export type IssueFilter = "open" | "closed" | "all";

interface IssueState {
  filter: IssueFilter;
  label: string | null;
  search: string;
  selected: number | null;
  setFilter: (filter: IssueFilter) => void;
  setLabel: (label: string | null) => void;
  setSearch: (search: string) => void;
  select: (number: number | null) => void;
  reset: () => void;
}

export const useIssueStore = create<IssueState>((set) => ({
  filter: "open",
  label: null,
  search: "",
  selected: null,
  setFilter: (filter) => set({ filter, selected: null }),
  setLabel: (label) => set({ label, selected: null }),
  setSearch: (search) => set({ search }),
  select: (selected) => set({ selected }),
  reset: () => set({ filter: "open", label: null, search: "", selected: null }),
}));
