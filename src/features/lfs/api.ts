import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { LfsStatus, Progress } from "@/shared/types/git";

export function getLfsStatus(path: string): Promise<LfsStatus> {
  return call<LfsStatus>("lfs_status_get", { path });
}

export function installLfs(path: string): Promise<void> {
  return call<void>("lfs_install_local", { path });
}

export function trackLfsPattern(path: string, pattern: string): Promise<void> {
  return call<void>("lfs_track_pattern", { path, pattern });
}

export function untrackLfsPattern(path: string, pattern: string): Promise<void> {
  return call<void>("lfs_untrack_pattern", { path, pattern });
}

export function pullLfsFiles(path: string, jobId: string, onProgress: (progress: Progress) => void): Promise<void> {
  return callWithProgress<void>("lfs_pull_files", { path, jobId }, onProgress);
}
