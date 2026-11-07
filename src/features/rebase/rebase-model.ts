import type { RebaseAction, RebasePlan, RebaseStepPayload } from "@/shared/types/git";

export interface DraftStep {
  hash: string;
  shortHash: string;
  subject: string;
  pushed: boolean;
  action: RebaseAction;
  message: string;
}

export type DraftProblem = "firstSquash" | "emptyReword";

export function createDraft(plan: RebasePlan): DraftStep[] {
  return plan.commits.map((commit) => ({
    hash: commit.hash,
    shortHash: commit.shortHash,
    subject: commit.subject,
    pushed: commit.pushed,
    action: "pick",
    message: "",
  }));
}

export function moveStep(steps: readonly DraftStep[], from: number, to: number): DraftStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) {
    return [...steps];
  }
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  if (moved) {
    next.splice(to, 0, moved);
  }
  return next;
}

export function isHeadAction(action: RebaseAction): boolean {
  return action === "pick" || action === "reword" || action === "edit";
}

export function groupMembers(steps: readonly DraftStep[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  let head: number | null = null;
  steps.forEach((step, index) => {
    if (isHeadAction(step.action)) {
      head = index;
      groups.set(index, []);
    } else if (head !== null && (step.action === "squash" || step.action === "fixup")) {
      groups.get(head)?.push(index);
    }
  });
  return groups;
}

export function validateDraft(steps: readonly DraftStep[]): DraftProblem | null {
  let headSeen = false;
  for (const step of steps) {
    if (isHeadAction(step.action)) {
      headSeen = true;
      if (step.action === "reword" && step.message.trim().length === 0) {
        return "emptyReword";
      }
    } else if ((step.action === "squash" || step.action === "fixup") && !headSeen) {
      return "firstSquash";
    }
  }
  return null;
}

export function isUnchanged(steps: readonly DraftStep[], plan: RebasePlan): boolean {
  return (
    steps.length === plan.commits.length &&
    steps.every((step, index) => step.action === "pick" && step.hash === plan.commits[index]?.hash)
  );
}

export function needsFinalMessage(steps: readonly DraftStep[], index: number): boolean {
  const step = steps[index];
  if (!step || !isHeadAction(step.action)) {
    return false;
  }
  if (step.action === "reword") {
    return true;
  }
  return (groupMembers(steps).get(index)?.length ?? 0) > 0;
}

export function toPayload(steps: readonly DraftStep[]): RebaseStepPayload[] {
  return steps.map((step, index) => ({
    hash: step.hash,
    action: step.action,
    message: needsFinalMessage(steps, index) && step.message.trim().length > 0 ? step.message : null,
  }));
}

export function rewritesPublishedCommits(steps: readonly DraftStep[], plan: RebasePlan): boolean {
  return !isUnchanged(steps, plan) && plan.commits.some((commit) => commit.pushed);
}
