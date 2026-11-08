import { call } from "@/shared/lib/tauri-client";

export type FindingKind = "secret" | "largeFile" | "conflictMarker" | "riskyFile";
export type FindingLevel = "warning" | "blocking";

export interface Finding {
  path: string;
  line: number | null;
  kind: FindingKind;
  rule: string;
  level: FindingLevel;
  size: number | null;
}

export function scanStaged(path: string): Promise<Finding[]> {
  return call<Finding[]>("guard_scan", { path });
}

export function silenceFinding(path: string, rule: string, file: string): Promise<void> {
  return call<void>("guard_silence", { path, rule, file });
}
