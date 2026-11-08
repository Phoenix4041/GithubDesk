import { call } from "@/shared/lib/tauri-client";
import type { CleanupPreview, CleanupReport, CleanupRequest, StaleRemoteBranch } from "@/shared/types/git";

export function getCleanupPreview(path: string): Promise<CleanupPreview> {
  return call<CleanupPreview>("cleanup_preview_get", { path });
}

export function getStaleRemoteBranches(path: string): Promise<StaleRemoteBranch[]> {
  return call<StaleRemoteBranch[]>("cleanup_stale_remote_get", { path });
}

export function runCleanup(path: string, request: CleanupRequest): Promise<CleanupReport> {
  return call<CleanupReport>("cleanup_run", { path, request });
}
