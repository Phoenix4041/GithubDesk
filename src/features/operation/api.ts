import { call } from "@/shared/lib/tauri-client";
import type { OperationAction, RepoOperation } from "@/shared/types/git";

export function getOperationState(path: string): Promise<RepoOperation | null> {
  return call<RepoOperation | null>("operation_state", { path });
}

export function runOperation(path: string, action: OperationAction): Promise<void> {
  return call<void>("operation_run", { path, action });
}
