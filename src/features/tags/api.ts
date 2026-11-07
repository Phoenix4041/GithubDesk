import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { Progress, Tag } from "@/shared/types/git";

export function listTags(path: string): Promise<Tag[]> {
  return call<Tag[]>("tag_list", { path });
}

export function createTag(path: string, name: string, target: string | null, message: string | null): Promise<void> {
  return call<void>("tag_create", { path, name, target, message });
}

export function deleteTag(path: string, name: string): Promise<void> {
  return call<void>("tag_delete", { path, name });
}

export function pushTag(path: string, name: string, jobId: string, onProgress: (progress: Progress) => void): Promise<void> {
  return callWithProgress<void>("tag_push", { path, name, jobId }, onProgress);
}

export function deleteRemoteTag(
  path: string,
  name: string,
  jobId: string,
  onProgress: (progress: Progress) => void,
): Promise<void> {
  return callWithProgress<void>("tag_delete_remote", { path, name, jobId }, onProgress);
}
