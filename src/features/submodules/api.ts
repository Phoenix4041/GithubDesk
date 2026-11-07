import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { Progress, Submodule } from "@/shared/types/git";

export function listSubmodules(path: string): Promise<Submodule[]> {
  return call<Submodule[]>("submodule_list", { path });
}

export function addSubmodule(
  path: string,
  url: string,
  submodulePath: string,
  branch: string | null,
  jobId: string,
  onProgress: (progress: Progress) => void,
): Promise<void> {
  return callWithProgress<void>("submodule_add", { path, url, submodulePath, branch, jobId }, onProgress);
}

export interface SubmoduleUpdateOptions {
  submodulePath: string | null;
  init: boolean;
  recursive: boolean;
  remote: boolean;
}

export function updateSubmodules(
  path: string,
  options: SubmoduleUpdateOptions,
  jobId: string,
  onProgress: (progress: Progress) => void,
): Promise<void> {
  return callWithProgress<void>("submodule_update", { path, ...options, jobId }, onProgress);
}

export function removeSubmodule(path: string, submodulePath: string): Promise<void> {
  return call<void>("submodule_remove", { path, submodulePath });
}
