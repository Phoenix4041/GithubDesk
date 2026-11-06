import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RepositoryDialogs } from "@/features/repositories/components/repository-dialogs";
import { WelcomeScreen } from "@/features/repositories/components/welcome-screen";
import { useRepositoriesStore } from "@/features/repositories/store";
import { stopRepoWatcher } from "@/features/repositories/use-repo-watcher";
import { useTheme } from "@/features/settings/use-theme";
import { queryClient } from "@/shared/lib/query-client";
import { ToastRegion } from "@/shared/ui/toast-region";
import { Workspace } from "./workspace";

export function App() {
  const { i18n } = useTranslation();
  const activePath = useRepositoriesStore((state) => state.activePath);

  useTheme();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    if (!activePath) {
      void stopRepoWatcher().catch(() => undefined);
    }
  }, [activePath]);

  return (
    <QueryClientProvider client={queryClient}>
      {activePath ? <Workspace key={activePath} repoPath={activePath} /> : <WelcomeScreen />}
      <RepositoryDialogs />
      <ToastRegion />
    </QueryClientProvider>
  );
}
