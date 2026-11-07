import { useEffect, useMemo } from "react";
import { changeLanguage } from "@/i18n";
import { useGithubTarget } from "@/features/github/components/github-gate";
import { useIssueStore } from "@/features/github/issues/store";
import { usePullStore } from "@/features/github/pulls/store";
import { useRunStore } from "@/features/github/actions/store";
import { useBranchDialogStore } from "@/features/branches/dialog-store";
import { useMergeDialogStore } from "@/features/merge/store";
import { useRebaseOntoStore } from "@/features/rebase/store";
import { useReflogDialogStore } from "@/features/reflog/store";
import { pickAndOpenRepository } from "@/features/repositories/actions";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { useSettingsStore } from "@/features/settings/store";
import { openRepositoryInEditor, revealRepositoryPath } from "@/features/external/actions";
import { useGitignoreDialogStore } from "@/features/gitignore/store";
import { useSigningDialogStore } from "@/features/signing/store";
import { useSubmoduleDialogStore } from "@/features/submodules/dialog-store";
import { useTerminalStore } from "@/features/terminal/store";
import { useWorktreeDialogStore } from "@/features/worktrees/dialog-store";
import type { ThemePreference } from "@/features/settings/store";
import { useStashDialogStore } from "@/features/stash/store";
import { runSyncOperation } from "@/features/sync/operations";
import { useTagDialogStore } from "@/features/tags/dialog-store";
import { openLogFolder } from "@/shared/lib/diagnostics";
import { reportError } from "@/shared/lib/report-error";
import { useUiStore } from "@/shared/lib/ui-store";
import type { SidebarTab, WorkspaceTab } from "@/shared/lib/ui-store";
import { useCommandRegistry } from "./command-registry";
import { useCommandUiStore } from "./command-ui-store";
import type { AppCommand } from "./command-model";

function goToTab(tab: WorkspaceTab): void {
  useUiStore.getState().setTab(tab);
}

function goToSidebar(tab: SidebarTab): void {
  useUiStore.getState().setSidebarTab(tab);
}

function setTheme(theme: ThemePreference): void {
  useSettingsStore.getState().setTheme(theme);
}

function setLanguage(language: "es" | "en"): void {
  useSettingsStore.getState().setLanguage(language);
  void changeLanguage(language);
}

export function buildGlobalCommands(): AppCommand[] {
  return [
    {
      id: "palette.toggle",
      titleKey: "commands.items.palette.toggle",
      group: "general",
      keywords: "comandos buscar command palette",
      defaultShortcut: "Mod+K",
      enabled: true,
      run: () => useCommandUiStore.getState().togglePalette(),
    },
    {
      id: "app.settings",
      titleKey: "commands.items.app.settings",
      group: "general",
      keywords: "ajustes configuracion settings preferencias",
      defaultShortcut: "Mod+,",
      enabled: true,
      run: () => useUiStore.getState().setSettingsOpen(true),
    },
    {
      id: "app.shortcuts",
      titleKey: "commands.items.app.shortcuts",
      group: "general",
      keywords: "teclado atajos keyboard shortcuts",
      enabled: true,
      run: () => useCommandUiStore.getState().setShortcutsOpen(true),
    },
    {
      id: "app.logs",
      titleKey: "commands.items.app.logs",
      group: "tools",
      keywords: "registro errores log diagnostico carpeta logs",
      enabled: true,
      run: () => openLogFolder().catch(reportError),
    },
    {
      id: "app.theme.system",
      titleKey: "commands.items.app.theme.system",
      group: "general",
      keywords: "tema apariencia theme",
      enabled: true,
      run: () => setTheme("system"),
    },
    {
      id: "app.theme.light",
      titleKey: "commands.items.app.theme.light",
      group: "general",
      keywords: "tema apariencia theme claro",
      enabled: true,
      run: () => setTheme("light"),
    },
    {
      id: "app.theme.dark",
      titleKey: "commands.items.app.theme.dark",
      group: "general",
      keywords: "tema apariencia theme oscuro",
      enabled: true,
      run: () => setTheme("dark"),
    },
    {
      id: "app.language.es",
      titleKey: "commands.items.app.language.es",
      group: "general",
      keywords: "idioma language",
      enabled: true,
      run: () => setLanguage("es"),
    },
    {
      id: "app.language.en",
      titleKey: "commands.items.app.language.en",
      group: "general",
      keywords: "idioma language",
      enabled: true,
      run: () => setLanguage("en"),
    },
    {
      id: "repo.open",
      titleKey: "commands.items.repo.open",
      group: "repository",
      keywords: "abrir carpeta open folder",
      defaultShortcut: "Mod+O",
      enabled: true,
      run: () => pickAndOpenRepository(),
    },
    {
      id: "repo.clone",
      titleKey: "commands.items.repo.clone",
      group: "repository",
      keywords: "clonar descargar clone",
      defaultShortcut: "Mod+Shift+O",
      enabled: true,
      run: () => useRepositoryDialogStore.getState().show("clone"),
    },
    {
      id: "repo.create",
      titleKey: "commands.items.repo.create",
      group: "repository",
      keywords: "nuevo crear init create",
      defaultShortcut: "Mod+N",
      enabled: true,
      run: () => useRepositoryDialogStore.getState().show("create"),
    },
  ];
}

export function buildRepoCommands(repoPath: string, onGithub: boolean, hasGithubAccount: boolean): AppCommand[] {
  const githubReady = onGithub && hasGithubAccount;
  return [
    {
      id: "nav.changes",
      titleKey: "commands.items.nav.changes",
      group: "navigation",
      keywords: "cambios changes ir",
      defaultShortcut: "Mod+1",
      enabled: true,
      run: () => goToTab("changes"),
    },
    {
      id: "nav.history",
      titleKey: "commands.items.nav.history",
      group: "navigation",
      keywords: "historial history commits ir",
      defaultShortcut: "Mod+2",
      enabled: true,
      run: () => goToTab("history"),
    },
    {
      id: "nav.pulls",
      titleKey: "commands.items.nav.pulls",
      group: "navigation",
      keywords: "pull requests pr ir",
      defaultShortcut: "Mod+3",
      enabled: githubReady,
      run: () => goToTab("pulls"),
    },
    {
      id: "nav.issues",
      titleKey: "commands.items.nav.issues",
      group: "navigation",
      keywords: "issues problemas ir",
      defaultShortcut: "Mod+4",
      enabled: githubReady,
      run: () => goToTab("issues"),
    },
    {
      id: "nav.actions",
      titleKey: "commands.items.nav.actions",
      group: "navigation",
      keywords: "actions workflows ci ir",
      defaultShortcut: "Mod+5",
      enabled: githubReady,
      run: () => goToTab("actions"),
    },
    {
      id: "sidebar.branches",
      titleKey: "commands.items.sidebar.branches",
      group: "navigation",
      keywords: "ramas branches barra lateral",
      defaultShortcut: "Mod+Alt+1",
      enabled: true,
      run: () => goToSidebar("branches"),
    },
    {
      id: "sidebar.tags",
      titleKey: "commands.items.sidebar.tags",
      group: "navigation",
      keywords: "etiquetas tags barra lateral",
      defaultShortcut: "Mod+Alt+2",
      enabled: true,
      run: () => goToSidebar("tags"),
    },
    {
      id: "sidebar.stashes",
      titleKey: "commands.items.sidebar.stashes",
      group: "navigation",
      keywords: "stash guardados barra lateral",
      defaultShortcut: "Mod+Alt+3",
      enabled: true,
      run: () => goToSidebar("stashes"),
    },
    {
      id: "sync.fetch",
      titleKey: "commands.items.sync.fetch",
      group: "sync",
      keywords: "traer novedades remoto",
      defaultShortcut: "Mod+Shift+F",
      enabled: true,
      run: () => runSyncOperation("fetch", repoPath),
    },
    {
      id: "sync.pull",
      titleKey: "commands.items.sync.pull",
      group: "sync",
      keywords: "descargar bajar cambios",
      defaultShortcut: "Mod+Shift+L",
      enabled: true,
      run: () => runSyncOperation("pull", repoPath),
    },
    {
      id: "sync.push",
      titleKey: "commands.items.sync.push",
      group: "sync",
      keywords: "enviar subir commits",
      defaultShortcut: "Mod+P",
      enabled: true,
      run: () => runSyncOperation("push", repoPath),
    },
    {
      id: "branch.new",
      titleKey: "commands.items.branch.new",
      group: "branches",
      keywords: "crear rama branch",
      defaultShortcut: "Mod+Shift+N",
      enabled: true,
      run: () => useBranchDialogStore.getState().show({ kind: "create" }),
    },
    {
      id: "branch.merge",
      titleKey: "commands.items.branch.merge",
      group: "branches",
      keywords: "combinar merge unir fusionar rama",
      enabled: true,
      run: () => useMergeDialogStore.getState().choose(),
    },
    {
      id: "branch.rebaseOnto",
      titleKey: "commands.items.branch.rebaseOnto",
      group: "branches",
      keywords: "rebase reaplicar linea recta historial rama",
      enabled: true,
      run: () => useRebaseOntoStore.getState().choose(),
    },
    {
      id: "tag.new",
      titleKey: "commands.items.tag.new",
      group: "branches",
      keywords: "crear etiqueta tag version",
      enabled: true,
      run: () => useTagDialogStore.getState().show({ kind: "create", target: null }),
    },
    {
      id: "stash.save",
      titleKey: "commands.items.stash.save",
      group: "branches",
      keywords: "guardar stash cambios temporales",
      defaultShortcut: "Mod+Shift+S",
      enabled: true,
      run: () => useStashDialogStore.getState().show({ kind: "save" }),
    },
    {
      id: "history.reflog",
      titleKey: "commands.items.history.reflog",
      group: "history",
      keywords: "reflog registro head recuperar",
      enabled: true,
      run: () => useReflogDialogStore.getState().show({ kind: "list" }),
    },
    {
      id: "history.undo",
      titleKey: "commands.items.history.undo",
      group: "history",
      keywords: "deshacer ultima operacion undo",
      enabled: true,
      run: () => useReflogDialogStore.getState().show({ kind: "undo" }),
    },
    {
      id: "worktree.new",
      titleKey: "commands.items.worktree.new",
      group: "branches",
      keywords: "crear worktree arbol de trabajo carpeta adicional",
      enabled: true,
      run: () => {
        goToSidebar("worktrees");
        useWorktreeDialogStore.getState().show({ kind: "create" });
      },
    },
    {
      id: "worktree.show",
      titleKey: "commands.items.worktree.show",
      group: "navigation",
      keywords: "worktrees arboles de trabajo",
      enabled: true,
      run: () => goToSidebar("worktrees"),
    },
    {
      id: "submodule.add",
      titleKey: "commands.items.submodule.add",
      group: "branches",
      keywords: "agregar submodulo dependencia repositorio anidado",
      enabled: true,
      run: () => {
        goToSidebar("submodules");
        useSubmoduleDialogStore.getState().show({ kind: "add" });
      },
    },
    {
      id: "submodule.update",
      titleKey: "commands.items.submodule.update",
      group: "branches",
      keywords: "actualizar inicializar submodulos",
      enabled: true,
      run: () => {
        goToSidebar("submodules");
        useSubmoduleDialogStore.getState().show({ kind: "update", submodule: null });
      },
    },
    {
      id: "submodule.show",
      titleKey: "commands.items.submodule.show",
      group: "navigation",
      keywords: "submodulos",
      enabled: true,
      run: () => goToSidebar("submodules"),
    },
    {
      id: "repo.openInEditor",
      titleKey: "commands.items.repo.openInEditor",
      group: "tools",
      keywords: "editor externo vscode visual studio code abrir carpeta",
      defaultShortcut: "Mod+Shift+E",
      enabled: true,
      run: () => openRepositoryInEditor(repoPath).then(() => undefined),
    },
    {
      id: "repo.reveal",
      titleKey: "commands.items.repo.reveal",
      group: "tools",
      keywords: "explorador carpeta archivos finder mostrar abrir",
      defaultShortcut: "Mod+Shift+X",
      enabled: true,
      run: () => revealRepositoryPath(repoPath).then(() => undefined),
    },
    {
      id: "gitignore.edit",
      titleKey: "commands.items.gitignore.edit",
      group: "tools",
      keywords: "gitignore ignorar archivos plantillas ignore",
      enabled: true,
      run: () => useGitignoreDialogStore.getState().show(),
    },
    {
      id: "lfs.show",
      titleKey: "commands.items.lfs.show",
      group: "tools",
      keywords: "git lfs archivos grandes large file storage",
      enabled: true,
      run: () => goToSidebar("lfs"),
    },
    {
      id: "signing.configure",
      titleKey: "commands.items.signing.configure",
      group: "tools",
      keywords: "firma firmar commits gpg ssh clave seguridad verificada signing",
      enabled: true,
      run: () => useSigningDialogStore.getState().show(),
    },
    {
      id: "terminal.toggle",
      titleKey: "commands.items.terminal.toggle",
      group: "tools",
      keywords: "terminal consola shell powershell bash linea de comandos",
      defaultShortcut: "Mod+J",
      enabled: true,
      run: () => useTerminalStore.getState().toggle(),
    },
    {
      id: "github.issue.new",
      titleKey: "commands.items.github.issueNew",
      group: "github",
      keywords: "crear issue problema reporte",
      enabled: githubReady,
      run: () => {
        goToTab("issues");
        useIssueStore.getState().setCreating(true);
      },
    },
    {
      id: "github.pull.new",
      titleKey: "commands.items.github.pullNew",
      group: "github",
      keywords: "crear pull request pr",
      enabled: githubReady,
      run: () => {
        goToTab("pulls");
        usePullStore.getState().setCreating(true);
      },
    },
    {
      id: "github.workflow.run",
      titleKey: "commands.items.github.workflowRun",
      group: "github",
      keywords: "ejecutar lanzar workflow actions dispatch",
      enabled: githubReady,
      run: () => {
        goToTab("actions");
        useRunStore.getState().setDispatching(true);
      },
    },
  ];
}

export function useGlobalCommands(): void {
  const setSource = useCommandRegistry((state) => state.setSource);
  const commands = useMemo(() => buildGlobalCommands(), []);
  useEffect(() => {
    setSource("global", commands);
  }, [commands, setSource]);
}

export function useRepoCommands(repoPath: string): void {
  const setSource = useCommandRegistry((state) => state.setSource);
  const clearSource = useCommandRegistry((state) => state.clearSource);
  const { target, hasRemote } = useGithubTarget(repoPath);
  const hasAccount = target !== null;
  const commands = useMemo(() => buildRepoCommands(repoPath, hasRemote, hasAccount), [repoPath, hasRemote, hasAccount]);
  useEffect(() => {
    setSource("repo", commands);
    return () => clearSource("repo");
  }, [commands, setSource, clearSource]);
}
