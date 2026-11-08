import { Download, FolderOpen, FolderPlus, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { homeContext } from "@/features/github/home/home-model";
import { GithubHome } from "@/features/github/home/components/github-home";
import { useGithubHomeDialogStore } from "@/features/github/home/store";
import { useInbox } from "@/features/github/home/queries";
import { NotificationsButton } from "@/features/github/notifications/components/notifications-button";
import { useAccounts } from "@/features/github/queries";
import { ProfileChips } from "@/features/profiles/components/profile-chips";
import { openRepositoryFromPath, pickAndOpenRepository } from "@/features/repositories/actions";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import { useUiStore } from "@/shared/lib/ui-store";
import { Button } from "@/shared/ui/button";
import { buildRecentRows, dayPeriod, displayName, recentPaths } from "../home-model";
import type { RecentRepoRow } from "../home-model";
import { useFailingPulls, useMentions, useRepoStates } from "../queries";
import { BlockEmpty, BlockError, BlockLoading, BlockShell, ItemBlock, RecentList } from "./dashboard-blocks";

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

function ActionCard({ icon, title, description, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-[transform,border-color,background-color] duration-150 ease-out-expo hover:border-accent/50 hover:bg-accent-soft/40 active:scale-[0.99]"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}

function RecentsBlock() {
  const { t } = useTranslation();
  const recents = useRepositoriesStore((state) => state.recents);
  const paths = recentPaths(recents);
  const states = useRepoStates(paths);
  const rows = buildRecentRows(recents, states.data);

  function open(row: RecentRepoRow) {
    void openRepositoryFromPath(row.path);
  }

  let body: ReactNode;
  if (recents.length === 0) {
    body = <BlockEmpty message={t("dashboard.recents.empty")} />;
  } else if (states.isPending) {
    body = <BlockLoading />;
  } else if (states.isError) {
    body = <BlockError error={states.error} onRetry={() => void states.refetch()} />;
  } else {
    body = <RecentList rows={rows} onOpen={open} />;
  }
  return <BlockShell title={t("dashboard.recents.title")}>{body}</BlockShell>;
}

interface GithubBlocksProps {
  accountId: string;
  org: string | null;
}

function GithubBlocks({ accountId, org }: GithubBlocksProps) {
  const { t } = useTranslation();
  const inbox = useInbox(accountId, org);
  const failing = useFailingPulls(accountId, org);
  const mentions = useMentions(accountId, org);
  const issues = inbox.data?.assigned.filter((item) => !item.pullRequest);

  return (
    <div className="grid grid-cols-2 gap-4">
      <ItemBlock
        title={t("dashboard.reviews.title")}
        emptyMessage={t("dashboard.reviews.empty")}
        query={inbox}
        items={inbox.data?.reviewRequested}
      />
      <ItemBlock
        title={t("dashboard.failing.title")}
        emptyMessage={t("dashboard.failing.empty")}
        query={failing}
        items={failing.data}
      />
      <ItemBlock title={t("dashboard.issues.title")} emptyMessage={t("dashboard.issues.empty")} query={inbox} items={issues} />
      <ItemBlock
        title={t("dashboard.mentions.title")}
        emptyMessage={t("dashboard.mentions.empty")}
        query={mentions}
        items={mentions.data}
      />
    </div>
  );
}

export function HomeDashboard() {
  const { t, i18n } = useTranslation();
  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const showRepositoryDialog = useRepositoryDialogStore((state) => state.show);
  const showCreateRemote = useGithubHomeDialogStore((state) => state.showCreate);

  const context = homeContext(profiles, activeProfileId, accounts.data ?? []);
  const name = displayName(context.account);
  const period = dayPeriod(new Date().getHours());
  const greeting = name === "" ? t(`dashboard.greetingAnonymous.${period}`) : t(`dashboard.greeting.${period}`, { name });

  return (
    <main className="h-full overflow-auto p-8" lang={i18n.language}>
      <div className="mx-auto flex w-full max-w-[860px] animate-[fade-in_300ms_ease-out] flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-fg">
              <GitBranch className="size-6" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
              <p className="text-sm text-muted">{t("dashboard.subtitle")}</p>
            </div>
          </div>
          <NotificationsButton />
        </header>

        <ProfileChips />

        <section className="grid grid-cols-4 gap-3" aria-label={t("welcome.actions")}>
          <ActionCard
            icon={<FolderOpen className="size-5" />}
            title={t("repositories.openExisting")}
            description={t("welcome.openDescription")}
            onClick={() => void pickAndOpenRepository()}
          />
          <ActionCard
            icon={<Download className="size-5" />}
            title={t("repositories.cloneFromUrl")}
            description={t("welcome.cloneDescription")}
            onClick={() => showRepositoryDialog("clone")}
          />
          <ActionCard
            icon={<FolderPlus className="size-5" />}
            title={t("repositories.createNew")}
            description={t("welcome.createDescription")}
            onClick={() => showRepositoryDialog("create")}
          />
          <ActionCard
            icon={<GitBranch className="size-5" />}
            title={t("dashboard.createRemote.title")}
            description={t("dashboard.createRemote.description")}
            onClick={() => showCreateRemote()}
          />
        </section>

        <RecentsBlock />

        {context.account ? (
          <GithubBlocks key={`${context.account.id}|${context.org ?? ""}`} accountId={context.account.id} org={context.org} />
        ) : accounts.isPending ? null : (
          <section
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
            aria-label={t("dashboard.connect.title")}
          >
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[13px] font-semibold">{t("dashboard.connect.title")}</h2>
              <p className="text-xs text-muted">{t("dashboard.connect.description")}</p>
            </div>
            <Button variant="primary" onClick={() => setSettingsOpen(true)}>
              {t("github.home.connectAction")}
            </Button>
          </section>
        )}

        {context.account ? <GithubHome /> : null}
      </div>
    </main>
  );
}
