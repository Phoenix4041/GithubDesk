import { call } from "@/shared/lib/tauri-client";
import type { CommitFile, FileDiff } from "@/shared/types/git";

export type TreeEntryKind = "file" | "folder" | "submodule";

export interface TreeEntry {
  name: string;
  path: string;
  kind: TreeEntryKind;
  mode: string;
  size: number | null;
}

export interface TreeListing {
  commit: string;
  folder: string;
  entries: TreeEntry[];
}

export type FileSource = { kind: "revision"; revision: string } | { kind: "index" } | { kind: "worktree" };

export interface FileContent {
  path: string;
  exists: boolean;
  size: number;
  binary: boolean;
  tooLarge: boolean;
  text: string | null;
  imageBase64: string | null;
}

export function listTree(path: string, revision: string, folder: string | null): Promise<TreeListing> {
  return call<TreeListing>("browse_tree", { path, revision, folder });
}

export function readFileAt(path: string, source: FileSource, filePath: string): Promise<FileContent> {
  return call<FileContent>("browse_read_file", { path, source, filePath });
}

export function restoreFileAt(path: string, revision: string, filePath: string): Promise<void> {
  return call<void>("browse_restore_file", { path, revision, filePath });
}

export function getRevisionFiles(path: string, base: string, head: string): Promise<CommitFile[]> {
  return call<CommitFile[]>("browse_diff_files", { path, base, head });
}

export function getRevisionDiff(
  path: string,
  base: string,
  head: string,
  filePath: string,
  oldPath: string | null,
  ignoreWhitespace: boolean,
): Promise<FileDiff> {
  return call<FileDiff>("browse_diff_file", { path, base, head, filePath, oldPath, ignoreWhitespace });
}
