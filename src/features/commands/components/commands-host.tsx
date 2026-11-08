import { useGithubTarget } from "@/features/github/components/github-gate";
import type { GithubTarget } from "@/features/github/target";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useGlobalCommands, useRepoCommands } from "../use-app-commands";
import { useGlobalShortcuts } from "../use-global-shortcuts";
import {
  useBranchJumpTargets,
  useFileJumpTargets,
  useGithubJumpTargets,
  useRepositoryJumpTargets,
} from "../use-jump-targets";
import { CommandPalette } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts-dialog";

function GithubJumpSources({ target }: { target: GithubTarget }) {
  useGithubJumpTargets(target);
  return null;
}

function RepoJumpSources({ repoPath }: { repoPath: string }) {
  const { target } = useGithubTarget(repoPath);
  useBranchJumpTargets(repoPath);
  useFileJumpTargets(repoPath);
  return target ? <GithubJumpSources target={target} /> : null;
}

function RepoCommands({ repoPath }: { repoPath: string }) {
  useRepoCommands(repoPath);
  return null;
}

export function CommandsHost() {
  const activePath = useRepositoriesStore((state) => state.activePath);
  useGlobalCommands();
  useGlobalShortcuts();
  useRepositoryJumpTargets();

  return (
    <>
      {activePath ? <RepoCommands repoPath={activePath} /> : null}
      {activePath ? <RepoJumpSources repoPath={activePath} /> : null}
      <CommandPalette />
      <ShortcutsDialog />
    </>
  );
}
