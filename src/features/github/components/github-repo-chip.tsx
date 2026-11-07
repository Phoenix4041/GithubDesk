import { Globe } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/shared/ui/avatar";
import { useGithubRepo } from "../use-github-repo";
import { RepoAccountDialog } from "./repo-account-dialog";

interface GithubRepoChipProps {
  repoPath: string;
}

export function GithubRepoChip({ repoPath }: GithubRepoChipProps) {
  const { t } = useTranslation();
  const { context, useForGit } = useGithubRepo(repoPath);
  const [open, setOpen] = useState(false);

  if (!context) {
    return null;
  }
  const { remote, account } = context;
  const label = `${remote.owner}/${remote.name}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={account ? t("github.repo.chipWithAccount", { login: account.login }) : t("github.repo.chipWithoutAccount")}
        className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors duration-150 hover:bg-subtle"
      >
        <Globe className="size-3.5 shrink-0 text-muted" />
        <span className="truncate font-medium">{label}</span>
        {account ? (
          <Avatar url={account.avatarUrl} name={account.login} size={16} />
        ) : (
          <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-medium text-warning">
            {t("github.repo.connect")}
          </span>
        )}
      </button>
      <RepoAccountDialog open={open} repoPath={repoPath} context={context} useForGit={useForGit} onClose={() => setOpen(false)} />
    </>
  );
}
