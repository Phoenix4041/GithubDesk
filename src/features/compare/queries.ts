import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { getCompareDiff, getCompareFiles, getCompareSummary, listRangeCommits } from "./api";

interface Pair {
  base: string | null;
  head: string | null;
}

export function useCompareSummary(repoPath: string, { base, head }: Pair) {
  return useQuery({
    queryKey: [...repoKeys.compare(repoPath), "summary", base, head],
    queryFn: () => getCompareSummary(repoPath, base ?? "", head ?? ""),
    enabled: base !== null && head !== null,
  });
}

export function useCompareFiles(repoPath: string, { base, head }: Pair) {
  return useQuery({
    queryKey: [...repoKeys.compare(repoPath), "files", base, head],
    queryFn: () => getCompareFiles(repoPath, base ?? "", head ?? ""),
    enabled: base !== null && head !== null,
  });
}

export function useCompareCommits(repoPath: string, range: string | null) {
  return useQuery({
    queryKey: [...repoKeys.compare(repoPath), "commits", range],
    queryFn: () => listRangeCommits(repoPath, range ?? ""),
    enabled: range !== null,
  });
}

interface CompareFileTarget extends Pair {
  path: string;
  oldPath: string | null;
}

export function useCompareFileDiff(repoPath: string, target: CompareFileTarget | null, ignoreWhitespace: boolean) {
  return useQuery({
    queryKey: [
      ...repoKeys.compare(repoPath),
      "diff",
      target?.base,
      target?.head,
      target?.path,
      ignoreWhitespace,
    ],
    queryFn: () => {
      if (!target || target.base === null || target.head === null) {
        throw new Error("No file selected");
      }
      return getCompareDiff(repoPath, target.base, target.head, target.path, target.oldPath, ignoreWhitespace);
    },
    enabled: target !== null && target.base !== null && target.head !== null,
  });
}
