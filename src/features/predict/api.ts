import { call } from "@/shared/lib/tauri-client";

export interface Prediction {
  source: string;
  supported: boolean;
  conflicts: boolean;
  files: string[];
}

export function predictBranches(path: string, sources: string[]): Promise<Prediction[]> {
  return call<Prediction[]>("predict_branches_conflicts", { path, sources });
}
