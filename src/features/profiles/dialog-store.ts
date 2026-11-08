import { create } from "zustand";
import type { Profile } from "./profile-model";

export interface ApplyTarget {
  repoPath: string;
  profile: Profile;
}

interface ProfileDialogState {
  manageOpen: boolean;
  pickerOpen: boolean;
  applying: ApplyTarget | null;
  showManage: () => void;
  hideManage: () => void;
  showPicker: () => void;
  hidePicker: () => void;
  showApply: (target: ApplyTarget) => void;
  hideApply: () => void;
}

export const useProfileDialogStore = create<ProfileDialogState>((set) => ({
  manageOpen: false,
  pickerOpen: false,
  applying: null,
  showManage: () => set({ manageOpen: true, pickerOpen: false }),
  hideManage: () => set({ manageOpen: false }),
  showPicker: () => set({ pickerOpen: true }),
  hidePicker: () => set({ pickerOpen: false }),
  showApply: (applying) => set({ applying, pickerOpen: false }),
  hideApply: () => set({ applying: null }),
}));
