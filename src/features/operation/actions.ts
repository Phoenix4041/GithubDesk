import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import type { OperationAction, OperationKind } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { runOperation } from "./api";

export async function runRepoOperation(
  repoPath: string,
  kind: OperationKind,
  action: OperationAction,
): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => runOperation(repoPath, action));
  if (succeeded) {
    const name = i18next.t(`operation.names.${kind}`);
    showToast({ kind: "info", title: i18next.t(`operation.toast.${toastKey(action)}`, { name }) });
  }
  return succeeded;
}

function toastKey(action: OperationAction): "continued" | "skipped" | "aborted" {
  switch (action) {
    case "continue":
      return "continued";
    case "skip":
      return "skipped";
    case "abort":
      return "aborted";
  }
}
