import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RepositoryInfo } from "@/shared/types/git";

export interface RecentRepository {
  path: string;
  name: string;
  lastOpened: number;
}

const MAX_RECENT_REPOSITORIES = 50;

interface RepositoriesState {
  recents: RecentRepository[];
  activePath: string | null;
  lastParentDirectory: string | null;
  activate: (info: RepositoryInfo) => void;
  deactivate: () => void;
  forget: (path: string) => void;
  rememberParentDirectory: (directory: string) => void;
}

export const useRepositoriesStore = create<RepositoriesState>()(
  persist(
    (set) => ({
      recents: [],
      activePath: null,
      lastParentDirectory: null,
      activate: (info) =>
        set((state) => {
          const others = state.recents.filter((recent) => recent.path !== info.path);
          const entry: RecentRepository = { path: info.path, name: info.name, lastOpened: Date.now() };
          return {
            recents: [entry, ...others].slice(0, MAX_RECENT_REPOSITORIES),
            activePath: info.path,
          };
        }),
      deactivate: () => set({ activePath: null }),
      forget: (path) =>
        set((state) => ({
          recents: state.recents.filter((recent) => recent.path !== path),
          activePath: state.activePath === path ? null : state.activePath,
        })),
      rememberParentDirectory: (directory) => set({ lastParentDirectory: directory }),
    }),
    { name: "githubdesk.repositories" },
  ),
);
