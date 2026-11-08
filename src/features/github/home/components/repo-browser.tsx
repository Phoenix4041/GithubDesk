import { Download, GitFork, Lock, Plus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { useGrantScopesStore } from "@/shared/lib/grant-scopes-store";
import { formatRelativeTime } from "@/shared/lib/format";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { describeError } from "@/shared/lib/report-error";
import type { GithubAccount, RepoSummary } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { SearchInput } from "@/shared/ui/search-input";
import { Skeleton } from "@/shared/ui/skeleton";
import { useContextRepos } from "../queries";
import { useGithubHomeDialogStore } from "../store";

interface RepoBrowserProps {
  account: GithubAccount;
  org: string | null;
}

function RepoRow({ repo, account }: { repo: RepoSummary; account: GithubAccount }) {
  const { t, i18n } = useTranslation();
  const showClone = useRepositoryDialogStore((state) => state.show);
  const updated = isoToUnixSeconds(repo.pushedAt);

  return (
    <li className="flex items-center gap-3 px-3 py-2 hover:bg-subtle">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <span className="truncate">{repo.name}</span>
          {repo.private ? <Lock className="size-3 shrink-0 text-muted" aria-label={t("github.home.private")} /> : null}
          {repo.fork ? <GitFork className="size-3 shrink-0 text-muted" aria-label={t("github.home.fork")} /> : null}
          {repo.archived ? (
            <span className="shrink-0 rounded-full bg-subtle px-1.5 py-px text-[10px] text-muted">{t("github.home.archived")}</span>
          ) : null}
        </span>
        <span className="truncate text-[11px] text-muted">
          {[repo.description, repo.language, updated > 0 ? formatRelativeTime(updated, i18n.language) : null]
            .filter((part): part is string => Boolean(part))
            .join(" · ")}
        </span>
      </div>
      <Button
        size="sm"
        icon={<Download className="size-3.5" />}
        aria-label={t("github.home.cloneRepo", { name: repo.fullName })}
        onClick={() => showClone("clone", { url: repo.cloneUrl, accountId: account.id })}
      >
        {t("github.home.clone")}
      </Button>
    </li>
  );
}

export function RepoBrowser({ account, org }: RepoBrowserProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const repos = useContextRepos(account.id, org, query);
  const showCreate = useGithubHomeDialogStore((state) => state.showCreate);
  const grantScopes = useGrantScopesStore((state) => state.show);
  const items = repos.data?.pages.flatMap((page) => page.items) ?? [];

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(text.trim());
  }

  let body;
  if (repos.isPending) {
    body = <Skeleton className="m-3 h-28" />;
  } else if (repos.isError) {
    const description = describeError(repos.error);
    body = (
      <div className="flex flex-col items-start gap-2 p-3 text-xs" role="alert">
        <p className="font-medium text-danger">{description.title}</p>
        <p className="text-muted">{description.message}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void repos.refetch()}>
            {t("common.retry")}
          </Button>
          {description.kind === "githubMissingScope" ? (
            <Button
              size="sm"
              onClick={() => grantScopes({ accountId: account.id, scopes: description.appError?.detail.split(",") ?? [] })}
            >
              {t("github.scopes.grant")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="p-3 text-xs text-muted">{query ? t("github.home.noMatches") : t("github.home.noRepos")}</p>;
  } else {
    body = (
      <>
        <ul className="divide-y divide-line" aria-label={t("github.home.reposLabel")}>
          {items.map((repo) => (
            <RepoRow key={repo.fullName} repo={repo} account={account} />
          ))}
        </ul>
        {repos.hasNextPage ? (
          <div className="p-3">
            <Button size="sm" loading={repos.isFetchingNextPage} onClick={() => void repos.fetchNextPage()}>
              {t("github.home.loadMore")}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <form onSubmit={search} className="min-w-0 flex-1">
          <SearchInput label={t("github.home.search")} value={text} onValueChange={setText} />
        </form>
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={showCreate}>
          {t("github.home.create")}
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-line bg-surface">{body}</div>
    </div>
  );
}
