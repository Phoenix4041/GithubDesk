import { call } from "@/shared/lib/tauri-client";
import type { MergeMode, MergeOutcome, MergePreview } from "@/shared/types/git";

export function getMergePreview(path: string, source: string): Promise<MergePreview> {
  return call<MergePreview>("merge_preview_get", { path, source });
}

export function mergeIntoCurrent(path: string, source: string, mode: MergeMode, message: string | null): Promise<MergeOutcome> {
  return call<MergeOutcome>("merge_branch_into_current", { path, source, mode, message });
}
