import { call } from "@/shared/lib/tauri-client";

export interface RepoRow {
  path: string;
  available: boolean;
  branch: string | null;
  upstream: string | null;
  changes: number;
  ahead: number;
  behind: number;
}

export type OutcomeState = "done" | "updated" | "upToDate" | "skipped" | "failed";

export interface RepoOutcome {
  path: string;
  state: OutcomeState;
  detail: string | null;
}

export function loadStatuses(paths: string[]): Promise<RepoRow[]> {
  return call<RepoRow[]>("multi_status", { paths });
}

export function fetchAll(paths: string[], jobId: string): Promise<RepoOutcome[]> {
  return call<RepoOutcome[]>("multi_fetch", { paths, jobId });
}

export function pullAll(paths: string[], jobId: string): Promise<RepoOutcome[]> {
  return call<RepoOutcome[]>("multi_pull", { paths, jobId });
}
