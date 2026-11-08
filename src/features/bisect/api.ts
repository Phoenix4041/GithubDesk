import { call } from "@/shared/lib/tauri-client";
import type { BisectState, BisectVerdict } from "@/shared/types/git";

export function getBisectState(path: string): Promise<BisectState> {
  return call<BisectState>("bisect_state_get", { path });
}

export function startBisect(path: string, bad: string, good: string): Promise<BisectState> {
  return call<BisectState>("bisect_start", { path, bad, good });
}

export function markBisect(path: string, verdict: BisectVerdict, revision: string | null): Promise<BisectState> {
  return call<BisectState>("bisect_mark", { path, verdict, revision });
}

export function finishBisect(path: string): Promise<void> {
  return call<void>("bisect_finish", { path });
}
