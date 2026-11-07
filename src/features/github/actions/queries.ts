import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { targetKey } from "../target";
import type { GithubTarget } from "../target";
import { getJobLog, getRunBundle, listRuns, listWorkflows } from "./api";
import { isRunFinished } from "./run-model";

const RUN_LIST_POLL_MS = 15_000;
const RUN_DETAIL_POLL_MS = 8_000;
const JOB_LOG_POLL_MS = 5_000;

export function useRuns(target: GithubTarget, status: string, branch: string) {
  return useInfiniteQuery({
    queryKey: targetKey(target, "runs", status, branch),
    queryFn: ({ pageParam }) => listRuns(target, status === "all" ? null : status, branch.trim() || null, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    refetchInterval: (query) => {
      const first = query.state.data?.pages[0]?.items ?? [];
      return first.some((run) => !isRunFinished(run)) ? RUN_LIST_POLL_MS : false;
    },
  });
}

export function useRunBundle(target: GithubTarget, runId: number | null) {
  return useQuery({
    queryKey: targetKey(target, "run", runId),
    queryFn: () => getRunBundle(target, runId ?? 0),
    enabled: runId !== null,
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return run && !isRunFinished(run) ? RUN_DETAIL_POLL_MS : false;
    },
  });
}

export function useJobLog(target: GithubTarget, jobId: number | null, finished: boolean) {
  return useQuery({
    queryKey: targetKey(target, "job-log", jobId),
    queryFn: () => getJobLog(target, jobId ?? 0),
    enabled: jobId !== null,
    retry: false,
    staleTime: finished ? 5 * 60_000 : 0,
    refetchInterval: finished ? false : JOB_LOG_POLL_MS,
  });
}

export function useWorkflows(target: GithubTarget, enabled: boolean) {
  return useQuery({
    queryKey: targetKey(target, "workflows"),
    queryFn: () => listWorkflows(target),
    enabled,
    staleTime: 5 * 60_000,
  });
}
