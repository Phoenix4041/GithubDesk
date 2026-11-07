import { Globe, UserRoundX } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import type { GithubTarget } from "../target";
import { useGithubRepo } from "../use-github-repo";
import { AddAccountDialog } from "./add-account-dialog";

interface GithubGateProps {
  repoPath: string;
  children: (target: GithubTarget) => ReactNode;
}

export function useGithubTarget(repoPath: string): { target: GithubTarget | null; hasRemote: boolean; loading: boolean } {
  const { context, loading } = useGithubRepo(repoPath);
  if (!context) {
    return { target: null, hasRemote: false, loading };
  }
  const { account, remote } = context;
  if (!account) {
    return { target: null, hasRemote: true, loading };
  }
  return {
    target: {
      accountId: account.id,
      host: remote.host,
      owner: remote.owner,
      repo: remote.name,
      remoteName: remote.remoteName,
    },
    hasRemote: true,
    loading,
  };
}

export function GithubGate({ repoPath, children }: GithubGateProps) {
  const { t } = useTranslation();
  const { target, hasRemote, loading } = useGithubTarget(repoPath);
  const [adding, setAdding] = useState(false);

  if (target) {
    return <>{children(target)}</>;
  }
  if (loading) {
    return <div className="flex-1" />;
  }
  if (!hasRemote) {
    return (
      <EmptyState
        icon={<Globe className="size-5" />}
        title={t("github.gate.noRemote.title")}
        description={t("github.gate.noRemote.description")}
      />
    );
  }
  return (
    <>
      <EmptyState
        icon={<UserRoundX className="size-5" />}
        title={t("github.gate.noAccount.title")}
        description={t("github.gate.noAccount.description")}
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t("github.accounts.add")}
          </Button>
        }
      />
      <AddAccountDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
