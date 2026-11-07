import { ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { openExternal } from "@/shared/lib/external";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { repositoryUrl } from "../github-repo-model";
import type { GithubRepoContext } from "../github-repo-model";
import { AddAccountDialog } from "./add-account-dialog";

interface RepoAccountDialogProps {
  open: boolean;
  repoPath: string;
  context: GithubRepoContext;
  useForGit: boolean;
  onClose: () => void;
}

export function RepoAccountDialog({ open, repoPath, context, useForGit, onClose }: RepoAccountDialogProps) {
  const { t } = useTranslation();
  const setRepoAccount = useSettingsStore((state) => state.setRepoAccount);
  const [adding, setAdding] = useState(false);
  const { remote, candidates, account } = context;

  function choose(accountId: string, gitToggle: boolean) {
    setRepoAccount(repoPath, { accountId, useForGit: gitToggle });
  }

  return (
    <Dialog
      open={open}
      title={t("github.repo.title", { name: `${remote.owner}/${remote.name}` })}
      description={t("github.repo.description", { host: remote.host })}
      onClose={onClose}
      width="md"
      footer={<Button onClick={onClose}>{t("common.done")}</Button>}
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium">{t("github.repo.accountLabel")}</legend>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted">{t("github.repo.noAccounts", { host: remote.host })}</p>
          ) : (
            candidates.map((candidate) => {
              const selected = account?.id === candidate.id;
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors duration-150",
                    selected ? "border-accent bg-accent-soft/40" : "border-line hover:bg-subtle",
                  )}
                >
                  <input
                    type="radio"
                    name="repo-account"
                    checked={selected}
                    onChange={() => choose(candidate.id, useForGit)}
                    className="size-3.5 cursor-pointer accent-accent"
                  />
                  <Avatar url={candidate.avatarUrl} name={candidate.login} size={24} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{candidate.name ?? candidate.login}</span>
                  <span className="shrink-0 text-[11px] text-muted">{candidate.login}</span>
                </label>
              );
            })
          )}
          <div>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
              {t("github.accounts.add")}
            </Button>
          </div>
        </fieldset>

        {account ? (
          <label className="flex cursor-pointer items-start gap-2.5 text-xs">
            <input
              type="checkbox"
              checked={useForGit}
              onChange={(event) => choose(account.id, event.target.checked)}
              className="mt-0.5 size-3.5 cursor-pointer accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{t("github.repo.useForGit")}</span>
              <span className="text-muted">{t("github.repo.useForGitHint")}</span>
            </span>
          </label>
        ) : null}

        <div>
          <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(repositoryUrl(remote))}>
            {t("github.repo.openOnGithub")}
          </Button>
        </div>
      </div>
      <AddAccountDialog open={adding} onClose={() => setAdding(false)} />
    </Dialog>
  );
}
