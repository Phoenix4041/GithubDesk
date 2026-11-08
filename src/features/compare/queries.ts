import { useQuery } from "@tanstack/react-query";
import { getRevisionDiff, getRevisionFiles } from "@/features/browse/api";
import { repoKeys } from "@/shared/lib/query-client";
import { getCompareDiff, getCompareFiles, getCompareSummary, listRangeCommits } from "./api";

interface Pair {
  base: string | null;
  head: string | null;
  exact?: boolean;
}

export function useCompareSummary(repoPath: string, { base, head }: Pair) {
  return useQuery({
    queryKey: [...repoKeys.compare(repoPath), "summary", base, head],
    queryFn: () => getCompareSummary(repoPath, base ?? "", head ?? ""),
    enabled: base !== null && head !== null,
  });
}

export function useCompareFiles(repoPath: string, { base, head, exact = false }: Pair) {
  return useQuery({
    queryKey: [...repoKeys.compare(repoPath), "files", base, head, exact],
    queryFn: () =>
      exact ? getRevisionFiles(repoPath, base ?? "", head ?? "") : getCompareFiles(repoPath, base ?? "", head ?? ""),
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
  const exact = target?.exact ?? false;
  return useQuery({
    queryKey: [
      ...repoKeys.compare(repoPath),
      "diff",
      target?.base,
      target?.head,
      target?.path,
      ignoreWhitespace,
      exact,
    ],
    queryFn: () => {
      if (!target || target.base === null || target.head === null) {
        throw new Error("No file selected");
      }
      const load = exact ? getRevisionDiff : getCompareDiff;
      return load(repoPath, target.base, target.head, target.path, target.oldPath, ignoreWhitespace);
    },
    enabled: target !== null && target.base !== null && target.head !== null,
  });
}
