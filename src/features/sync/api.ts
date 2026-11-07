import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { Progress, Remote } from "@/shared/types/git";

export function listRemotes(path: string): Promise<Remote[]> {
  return call<Remote[]>("remote_list", { path });
}

export function fetchRemotes(path: string, jobId: string, onProgress: (progress: Progress) => void): Promise<void> {
  return callWithProgress<void>("remote_fetch", { path, jobId }, onProgress);
}

export function pullCurrentBranch(path: string, jobId: string, onProgress: (progress: Progress) => void): Promise<void> {
  return callWithProgress<void>("remote_pull", { path, jobId }, onProgress);
}

export function pushCurrentBranch(
  path: string,
  jobId: string,
  onProgress: (progress: Progress) => void,
  forceWithLease = false,
): Promise<void> {
  return callWithProgress<void>("remote_push", { path, jobId, forceWithLease }, onProgress);
}

export function publishBranch(
  path: string,
  name: string,
  jobId: string,
  onProgress: (progress: Progress) => void,
): Promise<void> {
  return callWithProgress<void>("branch_publish", { path, name, jobId }, onProgress);
}
