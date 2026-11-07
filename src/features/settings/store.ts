import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "@/i18n";

export type ThemePreference = "system" | "light" | "dark";
export type DiffMode = "unified" | "split";

export interface RepoAccountChoice {
  accountId: string;
  useForGit: boolean;
}

export const SIDEBAR_WIDTH_RANGE = { min: 220, max: 440, initial: 280 };
export const CHANGES_WIDTH_RANGE = { min: 320, max: 760, initial: 400 };

interface SettingsState {
  theme: ThemePreference;
  language: Language;
  sidebarWidth: number;
  changesWidth: number;
  diffMode: DiffMode;
  ignoreWhitespace: boolean;
  githubClientId: string;
  repoAccounts: Record<string, RepoAccountChoice>;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Language) => void;
  setSidebarWidth: (width: number) => void;
  setChangesWidth: (width: number) => void;
  setDiffMode: (mode: DiffMode) => void;
  setIgnoreWhitespace: (ignore: boolean) => void;
  setGithubClientId: (clientId: string) => void;
  setRepoAccount: (repoPath: string, choice: RepoAccountChoice | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "es",
      sidebarWidth: SIDEBAR_WIDTH_RANGE.initial,
      changesWidth: CHANGES_WIDTH_RANGE.initial,
      diffMode: "unified",
      ignoreWhitespace: false,
      githubClientId: "",
      repoAccounts: {},
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setChangesWidth: (changesWidth) => set({ changesWidth }),
      setDiffMode: (diffMode) => set({ diffMode }),
      setIgnoreWhitespace: (ignoreWhitespace) => set({ ignoreWhitespace }),
      setGithubClientId: (githubClientId) => set({ githubClientId }),
      setRepoAccount: (repoPath, choice) =>
        set((state) => {
          const next = { ...state.repoAccounts };
          if (choice) {
            next[repoPath] = choice;
          } else {
            delete next[repoPath];
          }
          return { repoAccounts: next };
        }),
    }),
    { name: "githubdesk.settings" },
  ),
);
