import { i18next } from "@/i18n";
import { openNewPull } from "@/features/github/pulls/actions";
import type { GithubTarget } from "@/features/github/target";
import { runSyncOperation } from "@/features/sync/operations";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { restackStack, setStackParent } from "./api";
import type { StackNode } from "./api";

export function changeParent(repoPath: string, branch: string, parent: string | null): Promise<boolean> {
  return performRepoAction(repoPath, () => setStackParent(repoPath, branch, parent));
}

export async function restackAll(repoPath: string): Promise<boolean> {
  let restacked = 0;
  const done = await performRepoAction(repoPath, async () => {
    const report = await restackStack(repoPath);
    restacked = report.restacked.length;
  });
  if (done) {
    showToast({ kind: "success", title: i18next.t("stack.restacked", { count: restacked }) });
  }
  return done;
}

export function stackDescription(nodes: readonly StackNode[]): string {
  return nodes
    .filter((node) => node.parent !== null)
    .map((node, index) => `${index + 1}. ${node.name}`)
    .join("\n");
}

export async function openChainedPulls(repoPath: string, target: GithubTarget, nodes: readonly StackNode[]): Promise<number> {
  const chain = nodes.filter((node) => node.parent !== null);
  const body = `${i18next.t("stack.prBody")}\n\n${stackDescription(nodes)}`;
  let created = 0;
  for (const node of chain) {
    await runSyncOperation("publish", repoPath, node.name);
    const pull = await openNewPull(target, {
      title: node.name,
      body,
      head: node.name,
      base: node.parent ?? "",
      draft: false,
    });
    if (!pull) {
      break;
    }
    created += 1;
  }
  return created;
}
