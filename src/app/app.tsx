import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CommandsHost } from "@/features/commands/components/commands-host";
import { CreateGithubRepoDialog } from "@/features/github/home/components/create-github-repo-dialog";
import { NotificationsDialog } from "@/features/github/notifications/components/notifications-dialog";
import { useNotificationAlerts } from "@/features/github/notifications/use-notification-alerts";
import { OrgDialog } from "@/features/github/org-admin/components/org-dialog";
import { GrantScopesDialog } from "@/features/github/scopes/components/grant-scopes-dialog";
import { ProfilePickerDialog } from "@/features/profiles/components/profile-picker-dialog";
import { ProfilesDialog } from "@/features/profiles/components/profiles-dialog";
import { RepositoryDialogs } from "@/features/repositories/components/repository-dialogs";
import { HomeDashboard } from "@/features/home/components/home-dashboard";
import { useRepositoriesStore } from "@/features/repositories/store";
import { stopRepoWatcher } from "@/features/repositories/use-repo-watcher";
import { useTheme } from "@/features/settings/use-theme";
import { checkForUpdates } from "@/features/updates/actions";
import { queryClient } from "@/shared/lib/query-client";
import { ContextMenuHost } from "@/shared/ui/context-menu";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { ToastRegion } from "@/shared/ui/toast-region";
import { RenderFailure } from "./components/render-failure";
import { Workspace } from "./workspace";

const UPDATE_CHECK_DELAY_MS = 8000;

function NotificationWatcher() {
  useNotificationAlerts();
  return null;
}

export function App() {
  const { i18n } = useTranslation();
  const activePath = useRepositoriesStore((state) => state.activePath);

  useTheme();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdates(false), UPDATE_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!activePath) {
      void stopRepoWatcher().catch(() => undefined);
    }
  }, [activePath]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary fallback={(error, reset) => <RenderFailure error={error} onReset={reset} />}>
        {activePath ? <Workspace key={activePath} repoPath={activePath} /> : <HomeDashboard />}
      </ErrorBoundary>
      <RepositoryDialogs />
      <GrantScopesDialog />
      <NotificationWatcher />
      <CreateGithubRepoDialog />
      <OrgDialog />
      <NotificationsDialog />
      <ProfilesDialog />
      <ProfilePickerDialog />
      <CommandsHost />
      <ToastRegion />
      <ContextMenuHost />
    </QueryClientProvider>
  );
}
