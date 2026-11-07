import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";
import type { Job, Page, Workflow, WorkflowRun } from "../types";

function base(target: GithubTarget) {
  return { accountId: target.accountId, owner: target.owner, repo: target.repo };
}

export interface RunBundle {
  run: WorkflowRun;
  jobs: Job[];
}

export interface JobLog {
  text: string;
  truncated: boolean;
}

export function listRuns(
  target: GithubTarget,
  status: string | null,
  branch: string | null,
  page: number,
): Promise<Page<WorkflowRun>> {
  return call<Page<WorkflowRun>>("github_runs_list", { ...base(target), status, branch, page });
}

export async function getRunBundle(target: GithubTarget, runId: number): Promise<RunBundle> {
  const [run, jobs] = await Promise.all([
    call<WorkflowRun>("github_run_get", { ...base(target), runId }),
    call<Job[]>("github_run_jobs", { ...base(target), runId }),
  ]);
  return { run, jobs };
}

export function getJobLog(target: GithubTarget, jobId: number): Promise<JobLog> {
  return call<JobLog>("github_job_log", { ...base(target), jobId });
}

export function rerunRun(target: GithubTarget, runId: number, failedOnly: boolean): Promise<void> {
  return call<void>("github_run_rerun", { ...base(target), runId, failedOnly });
}

export function cancelRun(target: GithubTarget, runId: number): Promise<void> {
  return call<void>("github_run_cancel", { ...base(target), runId });
}

export function listWorkflows(target: GithubTarget): Promise<Workflow[]> {
  return call<Workflow[]>("github_workflows_list", base(target));
}

export function dispatchWorkflow(
  target: GithubTarget,
  workflowId: number,
  reference: string,
  inputs: Record<string, string>,
): Promise<void> {
  return call<void>("github_workflow_dispatch", { ...base(target), workflowId, reference, inputs });
}
