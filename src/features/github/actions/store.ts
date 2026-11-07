import { create } from "zustand";

interface RunState {
  status: string;
  branch: string;
  selected: number | null;
  selectedJob: number | null;
  setStatus: (status: string) => void;
  setBranch: (branch: string) => void;
  select: (runId: number | null) => void;
  selectJob: (jobId: number | null) => void;
  reset: () => void;
}

export const useRunStore = create<RunState>((set) => ({
  status: "all",
  branch: "",
  selected: null,
  selectedJob: null,
  setStatus: (status) => set({ status, selected: null, selectedJob: null }),
  setBranch: (branch) => set({ branch }),
  select: (selected) => set({ selected, selectedJob: null }),
  selectJob: (selectedJob) => set({ selectedJob }),
  reset: () => set({ status: "all", branch: "", selected: null, selectedJob: null }),
}));
