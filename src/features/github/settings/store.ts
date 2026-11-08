import { create } from "zustand";
import type { SettingsSection } from "./settings-model";

interface RepoSettingsState {
  section: SettingsSection;
  select: (section: SettingsSection) => void;
}

export const useRepoSettingsStore = create<RepoSettingsState>((set) => ({
  section: "general",
  select: (section) => set({ section }),
}));
