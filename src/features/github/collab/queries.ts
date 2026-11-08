import { useQuery } from "@tanstack/react-query";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import { listMilestones, listRepoTeams } from "./api";

export function useTeams(target: GithubTarget, enabled: boolean) {
  return useQuery({
    queryKey: targetKey(target, "teams"),
    queryFn: () => listRepoTeams(target),
    staleTime: 5 * 60_000,
    enabled,
    retry: false,
  });
}

export function useMilestones(target: GithubTarget, enabled: boolean) {
  return useQuery({
    queryKey: targetKey(target, "milestones", "open"),
    queryFn: () => listMilestones(target, "open"),
    staleTime: 60_000,
    enabled,
    retry: false,
  });
}
