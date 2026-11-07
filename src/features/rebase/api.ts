import { call } from "@/shared/lib/tauri-client";
import type { RebaseOntoPreview, RebasePlan, RebaseStepPayload } from "@/shared/types/git";

export function getRebasePlan(path: string, base: string): Promise<RebasePlan> {
  return call<RebasePlan>("rebase_plan", { path, base });
}

export function startRebase(path: string, base: string, steps: RebaseStepPayload[]): Promise<void> {
  return call<void>("rebase_start", { path, base, steps });
}

export function getRebaseOntoPreview(path: string, target: string): Promise<RebaseOntoPreview> {
  return call<RebaseOntoPreview>("rebase_onto_preview", { path, target });
}

export function runRebaseOnto(path: string, target: string, keepMerges: boolean): Promise<void> {
  return call<void>("rebase_onto_run", { path, target, keepMerges });
}
