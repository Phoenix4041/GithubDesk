import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import { getIssueBundle, listAssignees, listIssues, listLabels } from "./api";

export function useIssues(target: GithubTarget, issueState: string, label: string | null, search: string) {
  return useInfiniteQuery({
    queryKey: targetKey(target, "issues", issueState, label, search),
    queryFn: ({ pageParam }) => listIssues(target, issueState, label, search.trim() || null, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

export function useIssueBundle(target: GithubTarget, number: number | null) {
  return useQuery({
    queryKey: targetKey(target, "issue", number),
    queryFn: () => getIssueBundle(target, number ?? 0),
    enabled: number !== null,
  });
}

export function useLabels(target: GithubTarget, enabled = true) {
  return useQuery({
    queryKey: targetKey(target, "labels"),
    queryFn: () => listLabels(target),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useAssignees(target: GithubTarget, enabled: boolean) {
  return useQuery({
    queryKey: targetKey(target, "assignees"),
    queryFn: () => listAssignees(target),
    staleTime: 5 * 60_000,
    enabled,
  });
}
