import { useTranslation } from "react-i18next";
import { useStatus } from "@/features/changes/queries";
import { useUiStore } from "@/shared/lib/ui-store";
import { useGithubTarget } from "../../components/github-gate";
import { useRunStore } from "../../actions/store";
import { summarizeChecks } from "../../pulls/pull-model";
import { useCommitChecks } from "../queries";
import { ChecksBadge } from "./checks-badge";

export function BranchChecksButton({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const { target } = useGithubTarget(repoPath);
  const status = useStatus(repoPath);
  const branch = status.data?.branch;
  const checks = useCommitChecks(target, branch?.oid ?? null);

  if (!branch?.head || !checks.data || summarizeChecks(checks.data).state === "none") {
    return null;
  }
  const branchName = branch.head;

  function showRuns() {
    useRunStore.getState().setBranch(branchName);
    useUiStore.getState().setTab("actions");
  }

  return (
    <button
      type="button"
      onClick={showRuns}
      title={t("github.checks.branchTooltip", { branch: branchName })}
      className="flex cursor-pointer items-center rounded-md px-2 py-1 transition-colors duration-150 hover:bg-subtle"
    >
      <ChecksBadge runs={checks.data} />
    </button>
  );
}
