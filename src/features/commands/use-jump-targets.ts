import { useEffect, useMemo } from "react";
import { useBlameStore } from "@/features/blame/store";
import { switchToBranch } from "@/features/branches/actions";
import { useBranches } from "@/features/branches/queries";
import { useIssues } from "@/features/github/issues/queries";
import { useIssueStore } from "@/features/github/issues/store";
import { usePulls } from "@/features/github/pulls/queries";
import { usePullStore } from "@/features/github/pulls/store";
import type { GithubTarget } from "@/features/github/target";
import { useTrackedFiles } from "@/features/home/queries";
import { openRepositoryFromPath } from "@/features/repositories/actions";
import { useRepositoriesStore } from "@/features/repositories/store";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { useUiStore } from "@/shared/lib/ui-store";
import type { JumpTarget } from "./jump-model";
import { useJumpRegistry } from "./jump-registry";

function splitPath(path: string): { name: string; folder: string } {
  const index = path.lastIndexOf("/");
  return index === -1 ? { name: path, folder: "" } : { name: path.slice(index + 1), folder: path.slice(0, index) };
}

function useRegisterJumpSource(source: string, targets: JumpTarget[]): void {
  const setSource = useJumpRegistry((state) => state.setSource);
  const clearSource = useJumpRegistry((state) => state.clearSource);
  useEffect(() => {
    setSource(source, targets);
    return () => clearSource(source);
  }, [source, targets, setSource, clearSource]);
}

export function useRepositoryJumpTargets(): void {
  const recents = useRepositoriesStore((state) => state.recents);
  const activePath = useRepositoriesStore((state) => state.activePath);
  const targets = useMemo<JumpTarget[]>(
    () =>
      recents
        .filter((recent) => recent.path !== activePath)
        .map((recent) => ({
          id: recent.path,
          kind: "repository",
          title: recent.name,
          subtitle: recent.path,
          recentAt: recent.lastOpened,
          run: () => void openRepositoryFromPath(recent.path),
        })),
    [recents, activePath],
  );
  useRegisterJumpSource("repositories", targets);
}

export function useBranchJumpTargets(repoPath: string): void {
  const branches = useBranches(repoPath);
  const targets = useMemo<JumpTarget[]>(() => {
    const all = branches.data ?? [];
    return all
      .filter((branch) => !branch.isCurrent)
      .map((branch) => ({
        id: branch.fullName,
        kind: "branch",
        title: branch.name,
        subtitle: branch.isRemote ? (branch.remote ?? "") : "",
        recentAt: branch.tipTime * 1000,
        run: () => void switchToBranch(repoPath, branch, all),
      }));
  }, [branches.data, repoPath]);
  useRegisterJumpSource("branches", targets);
}

export function useFileJumpTargets(repoPath: string): void {
  const files = useTrackedFiles(repoPath);
  const targets = useMemo<JumpTarget[]>(
    () =>
      (files.data ?? []).map((path) => {
        const { name, folder } = splitPath(path);
        return {
          id: path,
          kind: "file",
          title: name,
          subtitle: folder,
          keywords: path,
          run: () => useBlameStore.getState().open({ path, revision: null }),
        };
      }),
    [files.data],
  );
  useRegisterJumpSource("files", targets);
}

export function useGithubJumpTargets(target: GithubTarget): void {
  const pulls = usePulls(target, "open");
  const issues = useIssues(target, "open", null, "");
  const pullTargets = useMemo<JumpTarget[]>(
    () =>
      (pulls.data?.pages.flatMap((page) => page.items) ?? []).map((pull) => ({
        id: String(pull.number),
        kind: "pull",
        title: pull.title,
        subtitle: `#${pull.number}`,
        keywords: `#${pull.number} ${pull.head.refName}`,
        recentAt: isoToUnixSeconds(pull.updatedAt) * 1000,
        run: () => {
          useUiStore.getState().setTab("pulls");
          usePullStore.getState().select(pull.number);
        },
      })),
    [pulls.data],
  );
  const issueTargets = useMemo<JumpTarget[]>(
    () =>
      (issues.data?.pages.flatMap((page) => page.items) ?? []).map((issue) => ({
        id: String(issue.number),
        kind: "issue",
        title: issue.title,
        subtitle: `#${issue.number}`,
        keywords: `#${issue.number}`,
        recentAt: isoToUnixSeconds(issue.updatedAt) * 1000,
        run: () => {
          useUiStore.getState().setTab("issues");
          useIssueStore.getState().select(issue.number);
        },
      })),
    [issues.data],
  );
  useRegisterJumpSource("pulls", pullTargets);
  useRegisterJumpSource("issues", issueTargets);
}
