import { call } from "@/shared/lib/tauri-client";

export function listSplitFiles(path: string, hash: string): Promise<string[]> {
  return call<string[]>("split_commit_files", { path, hash });
}

export function splitCommit(
  path: string,
  hash: string,
  firstPaths: string[],
  firstMessage: string,
  secondMessage: string,
): Promise<void> {
  return call<void>("split_commit_run", { path, hash, firstPaths, firstMessage, secondMessage });
}
