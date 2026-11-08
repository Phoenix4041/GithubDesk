import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { listContextRepos } from "../orgs/api";
import { getInbox } from "./api";

export const homeKeys = {
  repos: (accountId: string, org: string | null, query: string) =>
    ["github", "home", "repos", accountId, org ?? "", query] as const,
  inbox: (accountId: string, org: string | null) => ["github", "home", "inbox", accountId, org ?? ""] as const,
  all: ["github", "home"] as const,
};

export function useContextRepos(accountId: string | null, org: string | null, query: string) {
  return useInfiniteQuery({
    queryKey: homeKeys.repos(accountId ?? "", org, query),
    queryFn: ({ pageParam }) => listContextRepos(accountId ?? "", org, query === "" ? null : query, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: accountId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useInbox(accountId: string | null, org: string | null) {
  return useQuery({
    queryKey: homeKeys.inbox(accountId ?? "", org),
    queryFn: () => getInbox(accountId ?? "", org),
    enabled: accountId !== null,
    staleTime: 60_000,
    retry: false,
  });
}
