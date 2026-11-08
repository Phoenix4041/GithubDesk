import { call } from "@/shared/lib/tauri-client";

export type RescueKind = "snapshot" | "commit";

export interface RescueEntry {
  id: string;
  reason: string;
  label: string | null;
  kind: RescueKind;
  hash: string;
  createdAt: number;
  files: number;
  additions: number;
  deletions: number;
}

export interface RescueFile {
  path: string;
  additions: number | null;
  deletions: number | null;
}

export interface RescueDetail {
  entry: RescueEntry;
  files: RescueFile[];
  patch: string;
  truncated: boolean;
}

export function listRescue(path: string): Promise<RescueEntry[]> {
  return call<RescueEntry[]>("rescue_list", { path });
}

export function previewRescue(path: string, id: string): Promise<RescueDetail> {
  return call<RescueDetail>("rescue_preview", { path, id });
}

export function restoreRescue(path: string, id: string): Promise<void> {
  return call<void>("rescue_restore", { path, id });
}

export function branchFromRescue(path: string, id: string, name: string): Promise<void> {
  return call<void>("rescue_branch", { path, id, name });
}

export function deleteRescue(path: string, id: string): Promise<void> {
  return call<void>("rescue_delete", { path, id });
}
