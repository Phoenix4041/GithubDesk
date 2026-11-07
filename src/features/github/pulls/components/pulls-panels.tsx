import { GithubGate, useGithubTarget } from "../../components/github-gate";
import { PullDetail } from "./pull-detail";
import { PullList } from "./pull-list";

interface PanelProps {
  repoPath: string;
}

export function PullsPanel({ repoPath }: PanelProps) {
  return <GithubGate repoPath={repoPath}>{(target) => <PullList repoPath={repoPath} target={target} />}</GithubGate>;
}

export function PullDetailPanel({ repoPath }: PanelProps) {
  const { target } = useGithubTarget(repoPath);
  if (!target) {
    return null;
  }
  return <PullDetail repoPath={repoPath} target={target} />;
}
