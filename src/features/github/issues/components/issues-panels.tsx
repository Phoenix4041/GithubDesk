import { GithubGate, useGithubTarget } from "../../components/github-gate";
import { IssueDetail } from "./issue-detail";
import { IssueList } from "./issue-list";

interface PanelProps {
  repoPath: string;
}

export function IssuesPanel({ repoPath }: PanelProps) {
  return <GithubGate repoPath={repoPath}>{(target) => <IssueList target={target} />}</GithubGate>;
}

export function IssueDetailPanel({ repoPath }: PanelProps) {
  const { target } = useGithubTarget(repoPath);
  if (!target) {
    return null;
  }
  return <IssueDetail target={target} />;
}
