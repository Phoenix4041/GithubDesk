import { create } from "zustand";
import type { HeadCommit } from "@/shared/types/git";
import type { ChangeSection } from "./change-model";

export interface SelectedChange {
  section: ChangeSection;
  path: string;
}

interface CommitDraft {
  title: string;
  description: string;
}

interface ChangesState {
  selected: SelectedChange | null;
  draft: CommitDraft;
  amend: boolean;
  draftBeforeAmend: CommitDraft | null;
  select: (selected: SelectedChange | null) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setAmend: (enabled: boolean, head: HeadCommit | null) => void;
  clearDraft: () => void;
  reset: () => void;
}

const EMPTY_DRAFT: CommitDraft = { title: "", description: "" };

export const useChangesStore = create<ChangesState>((set) => ({
  selected: null,
  draft: EMPTY_DRAFT,
  amend: false,
  draftBeforeAmend: null,
  select: (selected) => set({ selected }),
  setTitle: (title) => set((state) => ({ draft: { ...state.draft, title } })),
  setDescription: (description) => set((state) => ({ draft: { ...state.draft, description } })),
  setAmend: (enabled, head) =>
    set((state) => {
      if (enabled && head) {
        return {
          amend: true,
          draftBeforeAmend: state.draft,
          draft: { title: head.title, description: head.description },
        };
      }
      return {
        amend: false,
        draftBeforeAmend: null,
        draft: state.draftBeforeAmend ?? state.draft,
      };
    }),
  clearDraft: () => set({ draft: EMPTY_DRAFT, amend: false, draftBeforeAmend: null }),
  reset: () => set({ selected: null, draft: EMPTY_DRAFT, amend: false, draftBeforeAmend: null }),
}));
