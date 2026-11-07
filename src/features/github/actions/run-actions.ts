import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { targetScope } from "../target";
import type { GithubTarget } from "../target";
import { cancelRun, dispatchWorkflow, rerunRun } from "./api";

async function run(target: GithubTarget, work: () => Promise<void>): Promise<boolean> {
  try {
    await work();
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export async function rerunWorkflowRun(target: GithubTarget, runId: number, failedOnly: boolean): Promise<boolean> {
  const done = await run(target, () => rerunRun(target, runId, failedOnly));
  if (done) {
    showToast({
      kind: "success",
      title: i18next.t(failedOnly ? "github.actions.rerunFailedToast" : "github.actions.rerunToast"),
    });
  }
  return done;
}

export async function cancelWorkflowRun(target: GithubTarget, runId: number): Promise<boolean> {
  const done = await run(target, () => cancelRun(target, runId));
  if (done) {
    showToast({ kind: "info", title: i18next.t("github.actions.cancelToast") });
  }
  return done;
}

export async function startWorkflow(
  target: GithubTarget,
  workflowId: number,
  reference: string,
  inputs: Record<string, string>,
): Promise<boolean> {
  const done = await run(target, () => dispatchWorkflow(target, workflowId, reference, inputs));
  if (done) {
    showToast({ kind: "success", title: i18next.t("github.actions.dispatchToast") });
  }
  return done;
}
