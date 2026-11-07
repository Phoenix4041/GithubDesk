import { call } from "@/shared/lib/tauri-client";
import type { BlameResult } from "@/shared/types/git";

export function getBlame(
  path: string,
  filePath: string,
  revision: string | null,
  ignoreWhitespace: boolean,
): Promise<BlameResult> {
  return call<BlameResult>("blame_get", { path, filePath, revision, ignoreWhitespace });
}
