import { call } from "@/shared/lib/tauri-client";
import type { PatchApplyMode, PatchPreview } from "@/shared/types/git";

export function exportPatches(path: string, hashes: string[], directory: string): Promise<string[]> {
  return call<string[]>("patch_export", { path, hashes, directory });
}

export function previewPatches(path: string, files: string[]): Promise<PatchPreview[]> {
  return call<PatchPreview[]>("patch_preview", { path, files });
}

export function applyPatches(path: string, files: string[], mode: PatchApplyMode): Promise<void> {
  return call<void>("patch_apply", { path, files, mode });
}
