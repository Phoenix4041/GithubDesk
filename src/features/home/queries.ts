import { useQuery } from "@tanstack/react-query";
import { getFailingPulls, getMentions, getRepoStates, listRepoFiles } from "./api";

export const dashboardKeys = {
  states: (paths: readonly string[]) => ["home", "states", ...paths] as const,
  mentions: (accountId: string, org: string | null) => ["home", "mentions", accountId, org ?? ""] as const,
  failing: (accountId: string, org: string | null) => ["home", "failing", accountId, org ?? ""] as const,
  files: (path: string) => ["repo", path, "tracked-files"] as const,
};

export function useRepoStates(paths: string[]) {
  return useQuery({
    queryKey: dashboardKeys.states(paths),
    queryFn: () => getRepoStates(paths),
    enabled: paths.length > 0,
    staleTime: 15_000,
    retry: false,
  });
}

export function useMentions(accountId: string | null, org: string | null) {
  return useQuery({
    queryKey: dashboardKeys.mentions(accountId ?? "", org),
    queryFn: () => getMentions(accountId ?? "", org),
    enabled: accountId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useFailingPulls(accountId: string | null, org: string | null) {
  return useQuery({
    queryKey: dashboardKeys.failing(accountId ?? "", org),
    queryFn: () => getFailingPulls(accountId ?? "", org),
    enabled: accountId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useTrackedFiles(path: string) {
  return useQuery({
    queryKey: dashboardKeys.files(path),
    queryFn: () => listRepoFiles(path),
    staleTime: 60_000,
    retry: false,
  });
}
