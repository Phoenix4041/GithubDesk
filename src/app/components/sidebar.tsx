import { GitBranch, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BranchList } from "@/features/branches/components/branch-list";
import { useBranchDialogStore } from "@/features/branches/dialog-store";
import { AddRepositoryMenu } from "@/features/repositories/components/add-repository-menu";
import { RepositoryList } from "@/features/repositories/components/repository-list";
import { IconButton } from "@/shared/ui/icon-button";

interface SidebarProps {
  repoPath: string;
}

export function Sidebar({ repoPath }: SidebarProps) {
  const { t } = useTranslation();
  const showBranchDialog = useBranchDialogStore((state) => state.show);

  return (
    <nav className="flex h-full min-h-0 flex-col bg-canvas" aria-label={t("sidebar.label")}>
      <section className="flex max-h-[42%] min-h-[170px] flex-col gap-2 pt-3">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t("repositories.title")}</h2>
          <AddRepositoryMenu />
        </div>
        <RepositoryList />
      </section>
      <section className="flex min-h-0 flex-1 flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between px-4">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
            <GitBranch className="size-3" />
            {t("branches.title")}
          </h2>
          <IconButton label={t("branches.new")} onClick={() => showBranchDialog({ kind: "create" })}>
            <Plus className="size-4" />
          </IconButton>
        </div>
        <BranchList repoPath={repoPath} />
      </section>
    </nav>
  );
}
