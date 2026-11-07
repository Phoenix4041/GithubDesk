import { useQuery } from "@tanstack/react-query";
import { summarizeChecks } from "../pulls/pull-model";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import { getCommitChecks } from "./api";

const POLL_MS = 10_000;

export function useCommitChecks(target: GithubTarget | null, sha: string | null) {
  return useQuery({
    queryKey: targetKey(target ?? { accountId: "", host: "", owner: "", repo: "", remoteName: "" }, "commit-checks", sha),
    queryFn: () => (target && sha ? getCommitChecks(target, sha) : Promise.resolve([])),
    enabled: target !== null && sha !== null,
    retry: false,
    staleTime: 20_000,
    refetchInterval: (query) => {
      const runs = query.state.data;
      return runs && summarizeChecks(runs).state === "pending" ? POLL_MS : false;
    },
  });
}
