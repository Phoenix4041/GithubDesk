import { refreshRepository } from "./query-client";
import { reportError } from "./report-error";

export async function performRepoAction(repoPath: string, action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    reportError(error);
    return false;
  } finally {
    await refreshRepository(repoPath);
  }
}
