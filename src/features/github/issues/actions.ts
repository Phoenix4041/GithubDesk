import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { targetScope } from "../target";
import type { GithubTarget } from "../target";
import type { Issue } from "../types";
import { commentOnIssue, createIssue, setIssueState } from "./api";
import type { NewIssue } from "./api";
import { useIssueStore } from "./store";

async function run<T>(target: GithubTarget, work: () => Promise<T>): Promise<T | null> {
  try {
    const result = await work();
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return result;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export async function openNewIssue(target: GithubTarget, request: NewIssue): Promise<Issue | null> {
  const created = await run(target, () => createIssue(target, request));
  if (created) {
    showToast({ kind: "success", title: i18next.t("github.issues.created", { number: created.number }) });
    useIssueStore.getState().select(created.number);
  }
  return created;
}

export async function addIssueComment(target: GithubTarget, number: number, body: string): Promise<boolean> {
  const comment = await run(target, () => commentOnIssue(target, number, body));
  return comment !== null;
}

export async function changeIssueState(
  target: GithubTarget,
  number: number,
  state: "open" | "closed",
  reason: string | null,
): Promise<boolean> {
  const updated = await run(target, () => setIssueState(target, number, state, reason));
  if (updated) {
    showToast({
      kind: "info",
      title: i18next.t(state === "closed" ? "github.issues.closedToast" : "github.issues.reopenedToast", { number }),
    });
  }
  return updated !== null;
}
