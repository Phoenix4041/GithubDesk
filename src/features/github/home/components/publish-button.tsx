import { CloudUpload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { useAccounts } from "../../queries";
import { useGithubRepo } from "../../use-github-repo";
import { useGithubHomeDialogStore } from "../store";

export function PublishButton({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const { context, loading } = useGithubRepo(repoPath);
  const accounts = useAccounts();
  const showPublish = useGithubHomeDialogStore((state) => state.showPublish);

  if (loading || context !== null || (accounts.data?.length ?? 0) === 0) {
    return null;
  }
  return (
    <Button size="sm" icon={<CloudUpload className="size-3.5" />} onClick={showPublish}>
      {t("github.home.publish")}
    </Button>
  );
}
