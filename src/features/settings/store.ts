import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "@/i18n";
import { BACKGROUND_SYNC_MINUTES, clampSyncMinutes } from "@/features/background/background-model";
import type { ShortcutOverrides } from "@/features/commands/shortcut-model";
import { removeProfile } from "@/features/profiles/profile-model";
import type { Profile } from "@/features/profiles/profile-model";

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
  wordDiff: boolean;
  githubClientId: string;
  notificationsEnabled: boolean;
  repoAccounts: Record<string, RepoAccountChoice>;
  profiles: Profile[];
  activeProfileId: string | null;
  repoProfiles: Record<string, string>;
  repoGroups: Record<string, string>;
  ignoredProfileHints: string[];
  shortcuts: ShortcutOverrides;
  terminalShell: string | null;
  externalEditor: string | null;
  externalEditorCommand: string;
  backgroundSyncEnabled: boolean;
  backgroundSyncMinutes: number;
  trayEnabled: boolean;
  autostartEnabled: boolean;
  setBackgroundSyncEnabled: (enabled: boolean) => void;
  setBackgroundSyncMinutes: (minutes: number) => void;
  setTrayEnabled: (enabled: boolean) => void;
  setAutostartEnabled: (enabled: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Language) => void;
  setSidebarWidth: (width: number) => void;
  setChangesWidth: (width: number) => void;
  setDiffMode: (mode: DiffMode) => void;
  setIgnoreWhitespace: (ignore: boolean) => void;
  setWordDiff: (enabled: boolean) => void;
  setGithubClientId: (clientId: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setRepoAccount: (repoPath: string, choice: RepoAccountChoice | null) => void;
  addProfile: (profile: Profile) => void;
  updateProfile: (profile: Profile) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  setRepoProfile: (repoPath: string, id: string | null) => void;
  setRepoGroup: (repoPath: string, group: string) => void;
  ignoreProfileHint: (repoPath: string) => void;
  setShortcuts: (shortcuts: ShortcutOverrides) => void;
  setTerminalShell: (shell: string | null) => void;
  setExternalEditor: (editor: string | null) => void;
  setExternalEditorCommand: (command: string) => void;
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
      wordDiff: true,
      githubClientId: "",
      notificationsEnabled: false,
      repoAccounts: {},
      profiles: [],
      activeProfileId: null,
      repoProfiles: {},
      repoGroups: {},
      ignoredProfileHints: [],
      shortcuts: {},
      terminalShell: null,
      externalEditor: null,
      externalEditorCommand: "",
      backgroundSyncEnabled: false,
      backgroundSyncMinutes: BACKGROUND_SYNC_MINUTES.initial,
      trayEnabled: false,
      autostartEnabled: false,
      setBackgroundSyncEnabled: (backgroundSyncEnabled) => set({ backgroundSyncEnabled }),
      setBackgroundSyncMinutes: (minutes) => set({ backgroundSyncMinutes: clampSyncMinutes(minutes) }),
      setTrayEnabled: (trayEnabled) => set({ trayEnabled }),
      setAutostartEnabled: (autostartEnabled) => set({ autostartEnabled }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setChangesWidth: (changesWidth) => set({ changesWidth }),
      setDiffMode: (diffMode) => set({ diffMode }),
      setIgnoreWhitespace: (ignoreWhitespace) => set({ ignoreWhitespace }),
      setWordDiff: (wordDiff) => set({ wordDiff }),
      setGithubClientId: (githubClientId) => set({ githubClientId }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
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
      addProfile: (profile) =>
        set((state) => ({
          profiles: [...state.profiles, profile],
          activeProfileId: state.activeProfileId ?? profile.id,
        })),
      updateProfile: (profile) =>
        set((state) => ({
          profiles: state.profiles.map((existing) => (existing.id === profile.id ? profile : existing)),
        })),
      deleteProfile: (id) =>
        set((state) => removeProfile(state.profiles, state.repoProfiles, state.activeProfileId, id)),
      setActiveProfile: (activeProfileId) => set({ activeProfileId }),
      setRepoProfile: (repoPath, id) =>
        set((state) => {
          const next = { ...state.repoProfiles };
          if (id) {
            next[repoPath] = id;
          } else {
            delete next[repoPath];
          }
          return { repoProfiles: next };
        }),
      setRepoGroup: (repoPath, group) =>
        set((state) => {
          const next = { ...state.repoGroups };
          const trimmed = group.trimStart();
          if (trimmed.length > 0) {
            next[repoPath] = trimmed;
          } else {
            delete next[repoPath];
          }
          return { repoGroups: next };
        }),
      ignoreProfileHint: (repoPath) =>
        set((state) =>
          state.ignoredProfileHints.includes(repoPath)
            ? state
            : { ignoredProfileHints: [...state.ignoredProfileHints, repoPath] },
        ),
      setShortcuts: (shortcuts) => set({ shortcuts }),
      setTerminalShell: (terminalShell) => set({ terminalShell }),
      setExternalEditor: (externalEditor) => set({ externalEditor }),
      setExternalEditorCommand: (externalEditorCommand) => set({ externalEditorCommand }),
    }),
    { name: "githubdesk.settings" },
  ),
);
