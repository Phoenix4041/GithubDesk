import { call } from "@/shared/lib/tauri-client";
import type { NewWorktree, Worktree } from "@/shared/types/git";

export function listWorktrees(path: string): Promise<Worktree[]> {
  return call<Worktree[]>("worktree_list", { path });
}

export function addWorktree(path: string, request: NewWorktree): Promise<void> {
  return call<void>("worktree_add", { path, request });
}

export function removeWorktree(path: string, worktree: string, force: boolean): Promise<void> {
  return call<void>("worktree_remove", { path, worktree, force });
}

export function lockWorktree(path: string, worktree: string, reason: string | null): Promise<void> {
  return call<void>("worktree_lock", { path, worktree, reason });
}

export function unlockWorktree(path: string, worktree: string): Promise<void> {
  return call<void>("worktree_unlock", { path, worktree });
}

export function pruneWorktrees(path: string): Promise<void> {
  return call<void>("worktree_prune", { path });
}
