import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { Progress, RepositoryInfo } from "@/shared/types/git";

export function openRepository(path: string): Promise<RepositoryInfo> {
  return call<RepositoryInfo>("repo_open", { path });
}

export function initRepository(parent: string, name: string, initialBranch: string): Promise<RepositoryInfo> {
  return call<RepositoryInfo>("repo_init", { parent, name, initialBranch });
}

export interface CloneOptions {
  depth: number | null;
  blobless: boolean;
}

export function cloneRepository(
  url: string,
  destination: string,
  jobId: string,
  accountId: string | null,
  onProgress: (progress: Progress) => void,
  options: CloneOptions = { depth: null, blobless: false },
): Promise<RepositoryInfo> {
  return callWithProgress<RepositoryInfo>("repo_clone", { url, destination, jobId, accountId, options }, onProgress);
}
