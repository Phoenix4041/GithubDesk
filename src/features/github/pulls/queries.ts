import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import { getPullBundle, getRepoInfo, listPullFiles, listPulls } from "./api";

export function useRepoInfo(target: GithubTarget) {
  return useQuery({
    queryKey: targetKey(target, "info"),
    queryFn: () => getRepoInfo(target),
    staleTime: 5 * 60_000,
  });
}

export function usePulls(target: GithubTarget, pullState: string) {
  return useInfiniteQuery({
    queryKey: targetKey(target, "pulls", pullState),
    queryFn: ({ pageParam }) => listPulls(target, pullState, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

export function usePullBundle(target: GithubTarget, number: number | null) {
  return useQuery({
    queryKey: targetKey(target, "pull", number),
    queryFn: () => getPullBundle(target, number ?? 0),
    enabled: number !== null,
  });
}

export function usePullFiles(target: GithubTarget, number: number | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: targetKey(target, "pull-files", number),
    queryFn: ({ pageParam }) => listPullFiles(target, number ?? 0, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: enabled && number !== null,
    staleTime: 60_000,
  });
}
