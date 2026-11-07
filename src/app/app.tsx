import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RepositoryDialogs } from "@/features/repositories/components/repository-dialogs";
import { WelcomeScreen } from "@/features/repositories/components/welcome-screen";
import { useRepositoriesStore } from "@/features/repositories/store";
import { stopRepoWatcher } from "@/features/repositories/use-repo-watcher";
import { useTheme } from "@/features/settings/use-theme";
import { queryClient } from "@/shared/lib/query-client";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { ToastRegion } from "@/shared/ui/toast-region";
import { RenderFailure } from "./components/render-failure";
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
      <ErrorBoundary fallback={(error, reset) => <RenderFailure error={error} onReset={reset} />}>
        {activePath ? <Workspace key={activePath} repoPath={activePath} /> : <WelcomeScreen />}
      </ErrorBoundary>
      <RepositoryDialogs />
      <ToastRegion />
    </QueryClientProvider>
  );
}
