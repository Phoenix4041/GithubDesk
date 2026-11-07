import { call } from "@/shared/lib/tauri-client";
import type { IgnoreFile, IgnoreMatch } from "@/shared/types/git";

export function readIgnoreFile(path: string): Promise<IgnoreFile> {
  return call<IgnoreFile>("gitignore_read", { path });
}

export function writeIgnoreFile(path: string, content: string): Promise<void> {
  return call<void>("gitignore_write", { path, content });
}

export function appendIgnoreLines(path: string, lines: string[]): Promise<number> {
  return call<number>("gitignore_append", { path, lines });
}

export function checkIgnored(path: string, paths: string[]): Promise<IgnoreMatch[]> {
  return call<IgnoreMatch[]>("gitignore_check", { path, paths });
}

export function listIgnoredTracked(path: string): Promise<string[]> {
  return call<string[]>("gitignore_tracked", { path });
}

export function untrackIgnored(path: string, paths: string[]): Promise<void> {
  return call<void>("gitignore_untrack", { path, paths });
}
