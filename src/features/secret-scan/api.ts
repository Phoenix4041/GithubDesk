import { call } from "@/shared/lib/tauri-client";

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
}

export function scanStagedSecrets(path: string): Promise<SecretFinding[]> {
  return call<SecretFinding[]>("secret_scan_staged", { path });
}

export function unstageSecretFiles(path: string, paths: string[]): Promise<void> {
  return call<void>("secret_scan_unstage", { path, paths });
}

export function ignoreSecretFiles(path: string, paths: string[]): Promise<number> {
  return call<number>("secret_scan_ignore", { path, paths });
}
