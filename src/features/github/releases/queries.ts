import { useInfiniteQuery } from "@tanstack/react-query";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import { listReleases } from "./api";

export function useReleases(target: GithubTarget) {
  return useInfiniteQuery({
    queryKey: targetKey(target, "releases"),
    queryFn: ({ pageParam }) => listReleases(target, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    staleTime: 30_000,
    retry: false,
  });
}
