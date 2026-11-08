import { call } from "@/shared/lib/tauri-client";

export interface StackNode {
  name: string;
  parent: string | null;
  depth: number;
  ahead: number;
  needsRestack: boolean;
  isCurrent: boolean;
}

export interface StackReport {
  restacked: string[];
}

export function listStack(path: string): Promise<StackNode[]> {
  return call<StackNode[]>("stack_list", { path });
}

export function setStackParent(path: string, branch: string, parent: string | null): Promise<void> {
  return call<void>("stack_set_parent", { path, branch, parent });
}

export function restackStack(path: string): Promise<StackReport> {
  return call<StackReport>("stack_restack", { path });
}
