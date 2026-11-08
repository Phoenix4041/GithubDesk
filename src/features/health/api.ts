import { call } from "@/shared/lib/tauri-client";

export interface ObjectCounts {
  looseObjects: number;
  looseBytes: number;
  packedObjects: number;
  packs: number;
  packBytes: number;
  prunableObjects: number;
  garbageFiles: number;
  garbageBytes: number;
}

export interface RefCounts {
  looseRefs: number;
  packedRefs: number;
  branches: number;
  unmergedBranches: number;
  stashes: number;
}

export interface SizeReport {
  gitDir: string;
  gitDirBytes: number;
  objects: ObjectCounts;
  refs: RefCounts;
  shallow: boolean;
  partial: boolean;
}

export interface LargeBlob {
  hash: string;
  size: number;
  path: string;
}

export interface SparseState {
  enabled: boolean;
  cone: boolean;
  folders: string[];
}

export interface MaintenanceReport {
  before: ObjectCounts;
  after: ObjectCounts;
  gitDirBefore: number;
  gitDirAfter: number;
  summary: string[];
}

export function loadSize(repoPath: string): Promise<SizeReport> {
  return call<SizeReport>("health_size", { repoPath });
}

export function findLargeBlobs(repoPath: string, jobId: string): Promise<LargeBlob[]> {
  return call<LargeBlob[]>("health_large_blobs", { repoPath, jobId });
}

export function runMaintenance(repoPath: string, jobId: string): Promise<MaintenanceReport> {
  return call<MaintenanceReport>("health_maintenance", { repoPath, jobId });
}

export function loadSparse(repoPath: string): Promise<SparseState> {
  return call<SparseState>("health_sparse_state", { repoPath });
}

export function setSparse(repoPath: string, folders: string[]): Promise<SparseState> {
  return call<SparseState>("health_sparse_set", { repoPath, folders });
}

export function disableSparse(repoPath: string): Promise<SparseState> {
  return call<SparseState>("health_sparse_disable", { repoPath });
}
