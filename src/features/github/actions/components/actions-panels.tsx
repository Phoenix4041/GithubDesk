import { GithubGate, useGithubTarget } from "../../components/github-gate";
import { RunDetail } from "./run-detail";
import { RunList } from "./run-list";

interface PanelProps {
  repoPath: string;
}

export function ActionsPanel({ repoPath }: PanelProps) {
  return <GithubGate repoPath={repoPath}>{(target) => <RunList target={target} />}</GithubGate>;
}

export function RunDetailPanel({ repoPath }: PanelProps) {
  const { target } = useGithubTarget(repoPath);
  if (!target) {
    return null;
  }
  return <RunDetail target={target} />;
}
