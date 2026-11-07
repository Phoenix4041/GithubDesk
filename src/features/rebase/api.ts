import { call } from "@/shared/lib/tauri-client";
import type { RebasePlan, RebaseStepPayload } from "@/shared/types/git";

export function getRebasePlan(path: string, base: string): Promise<RebasePlan> {
  return call<RebasePlan>("rebase_plan", { path, base });
}

export function startRebase(path: string, base: string, steps: RebaseStepPayload[]): Promise<void> {
  return call<void>("rebase_start", { path, base, steps });
}
