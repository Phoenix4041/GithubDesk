import { call } from "@/shared/lib/tauri-client";
import type { Branch } from "@/shared/types/git";

export function listBranches(path: string): Promise<Branch[]> {
  return call<Branch[]>("branch_list", { path });
}

export function createBranch(path: string, name: string, startPoint: string | null, checkout: boolean): Promise<void> {
  return call<void>("branch_create", { path, name, startPoint, checkout });
}

export function switchBranch(path: string, name: string, trackRemote: boolean): Promise<void> {
  return call<void>("branch_switch", { path, name, trackRemote });
}

export function renameBranch(path: string, oldName: string, newName: string): Promise<void> {
  return call<void>("branch_rename", { path, oldName, newName });
}

export function deleteBranch(path: string, name: string, force: boolean): Promise<void> {
  return call<void>("branch_delete", { path, name, force });
}
