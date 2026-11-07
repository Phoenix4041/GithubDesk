import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listTags } from "./api";

export function useTags(repoPath: string) {
  return useQuery({
    queryKey: repoKeys.tags(repoPath),
    queryFn: () => listTags(repoPath),
  });
}
