import { call } from "@/shared/lib/tauri-client";

export interface AbsorbTarget {
  hash: string;
  shortHash: string;
  title: string;
}

export interface AbsorbItem {
  path: string;
  hunk: string;
  added: number;
  removed: number;
  target: AbsorbTarget;
}

export type SkipReason = "onlyAdditions" | "manyCommits" | "published" | "unsupported" | "notFound";

export interface AbsorbSkipped {
  path: string;
  hunk: string | null;
  reason: SkipReason;
}

export interface AbsorbPlan {
  assignments: AbsorbItem[];
  skipped: AbsorbSkipped[];
}

export interface AbsorbReport {
  fixups: number;
  squashed: boolean;
}

export function previewAbsorb(path: string): Promise<AbsorbPlan> {
  return call<AbsorbPlan>("absorb_preview", { path });
}

export function runAbsorb(path: string, squash: boolean): Promise<AbsorbReport> {
  return call<AbsorbReport>("absorb_run", { path, squash });
}
