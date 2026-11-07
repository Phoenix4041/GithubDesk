import { i18next } from "@/i18n";
import { performRepoAction } from "@/shared/lib/repo-action";
import { showToast } from "@/shared/ui/toast-store";
import { appendIgnoreLines, untrackIgnored, writeIgnoreFile } from "./api";

export async function saveIgnoreFile(repoPath: string, content: string): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => writeIgnoreFile(repoPath, content));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("gitignore.saved") });
  }
  return succeeded;
}

export async function ignorePatterns(repoPath: string, patterns: string[]): Promise<boolean> {
  let added = 0;
  const succeeded = await performRepoAction(repoPath, async () => {
    added = await appendIgnoreLines(repoPath, patterns);
  });
  if (succeeded) {
    showToast({
      kind: "success",
      title: added > 0 ? i18next.t("gitignore.ignored", { pattern: patterns.join(", ") }) : i18next.t("gitignore.alreadyIgnored"),
    });
  }
  return succeeded;
}

export async function untrackIgnoredFiles(repoPath: string, paths: string[]): Promise<boolean> {
  const succeeded = await performRepoAction(repoPath, () => untrackIgnored(repoPath, paths));
  if (succeeded) {
    showToast({ kind: "success", title: i18next.t("gitignore.untracked", { count: paths.length }) });
  }
  return succeeded;
}
