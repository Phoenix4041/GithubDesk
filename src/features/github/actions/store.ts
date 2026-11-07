import { create } from "zustand";

interface RunState {
  status: string;
  branch: string;
  selected: number | null;
  selectedJob: number | null;
  dispatching: boolean;
  setStatus: (status: string) => void;
  setBranch: (branch: string) => void;
  select: (runId: number | null) => void;
  selectJob: (jobId: number | null) => void;
  setDispatching: (dispatching: boolean) => void;
  reset: () => void;
}

export const useRunStore = create<RunState>((set) => ({
  status: "all",
  branch: "",
  selected: null,
  selectedJob: null,
  dispatching: false,
  setStatus: (status) => set({ status, selected: null, selectedJob: null }),
  setBranch: (branch) => set({ branch }),
  select: (selected) => set({ selected, selectedJob: null }),
  selectJob: (selectedJob) => set({ selectedJob }),
  setDispatching: (dispatching) => set({ dispatching }),
  reset: () => set({ status: "all", branch: "", selected: null, selectedJob: null, dispatching: false }),
}));
