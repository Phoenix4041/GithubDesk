import { useRepositoriesStore } from "@/features/repositories/store";
import { useGlobalCommands, useRepoCommands } from "../use-app-commands";
import { useGlobalShortcuts } from "../use-global-shortcuts";
import { CommandPalette } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts-dialog";

function RepoCommands({ repoPath }: { repoPath: string }) {
  useRepoCommands(repoPath);
  return null;
}

export function CommandsHost() {
  const activePath = useRepositoriesStore((state) => state.activePath);
  useGlobalCommands();
  useGlobalShortcuts();

  return (
    <>
      {activePath ? <RepoCommands repoPath={activePath} /> : null}
      <CommandPalette />
      <ShortcutsDialog />
    </>
  );
}
