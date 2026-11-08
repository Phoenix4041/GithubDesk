import { reportError } from "@/shared/lib/report-error";
import { performRepoAction } from "@/shared/lib/repo-action";
import { ignoreSecretFiles, scanStagedSecrets, unstageSecretFiles } from "./api";
import type { SecretFinding } from "./api";

export async function findStagedSecrets(repoPath: string): Promise<SecretFinding[]> {
  try {
    return await scanStagedSecrets(repoPath);
  } catch (error) {
    reportError(error);
    return [];
  }
}

export function findingFiles(findings: readonly SecretFinding[]): string[] {
  return [...new Set(findings.map((finding) => finding.file))];
}

export function unstageFlaggedFiles(repoPath: string, findings: readonly SecretFinding[]): Promise<boolean> {
  return performRepoAction(repoPath, () => unstageSecretFiles(repoPath, findingFiles(findings)));
}

export function ignoreFlaggedFiles(repoPath: string, findings: readonly SecretFinding[]): Promise<boolean> {
  const files = findingFiles(findings);
  return performRepoAction(repoPath, async () => {
    await unstageSecretFiles(repoPath, files);
    await ignoreSecretFiles(repoPath, files);
  });
}
