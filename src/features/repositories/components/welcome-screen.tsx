import { Download, FolderOpen, FolderPlus, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProfileChips } from "@/features/profiles/components/profile-chips";
import { pickAndOpenRepository } from "../actions";
import { useRepositoryDialogStore } from "../dialog-store";
import { RepositoryList } from "./repository-list";

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

export function WelcomeScreen() {
  const { t } = useTranslation();
  const showDialog = useRepositoryDialogStore((state) => state.show);

  return (
    <main className="flex h-full items-center justify-center overflow-auto p-8">
      <div className="flex w-full max-w-[720px] animate-[fade-in_300ms_ease-out] flex-col gap-8">
        <header className="flex flex-col items-start gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-fg">
            <GitBranch className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("welcome.title")}</h1>
            <p className="text-sm text-muted">{t("welcome.subtitle")}</p>
          </div>
        </header>

        <ProfileChips />

        <section className="grid grid-cols-3 gap-3" aria-label={t("welcome.actions")}>
          <ActionCard
            icon={<FolderOpen className="size-5" />}
            title={t("repositories.openExisting")}
            description={t("welcome.openDescription")}
            onClick={() => void pickAndOpenRepository()}
          />
          <ActionCard
            icon={<FolderPlus className="size-5" />}
            title={t("repositories.createNew")}
            description={t("welcome.createDescription")}
            onClick={() => showDialog("create")}
          />
          <ActionCard
            icon={<Download className="size-5" />}
            title={t("repositories.cloneFromUrl")}
            description={t("welcome.cloneDescription")}
            onClick={() => showDialog("clone")}
          />
        </section>

        <section className="flex flex-col gap-2" aria-label={t("welcome.recents")}>
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("welcome.recents")}</h2>
          <div className="flex h-[280px] flex-col rounded-xl border border-line bg-surface py-3">
            <RepositoryList />
          </div>
        </section>
      </div>
    </main>
  );
}
