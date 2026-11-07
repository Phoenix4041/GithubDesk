import type { Branch, Worktree } from "@/shared/types/git";

export function slugifyBranch(name: string): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug === "" ? "worktree" : slug;
}

export function parentFolderOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index <= 0 ? trimmed : trimmed.slice(0, index);
}

export function folderNameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return trimmed.slice(index + 1);
}

export function defaultWorktreeName(repoPath: string, target: string): string {
  return `${folderNameOf(repoPath)}-${slugifyBranch(target)}`;
}

export function joinFolder(parent: string, name: string): string {
  if (parent === "") {
    return name;
  }
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export function branchesWithoutWorktree(branches: readonly Branch[], worktrees: readonly Worktree[]): Branch[] {
  const used = new Set(worktrees.map((worktree) => worktree.branch).filter((name): name is string => name !== null));
  return branches.filter((branch) => !branch.isRemote && !used.has(branch.name));
}

export function shortHead(head: string | null): string {
  return head === null ? "" : head.slice(0, 7);
}
