import { useQuery } from "@tanstack/react-query";
import { repoKeys } from "@/shared/lib/query-client";
import { listTree, readFileAt } from "./api";
import type { FileSource } from "./api";

function sourceKey(source: FileSource): string {
  return source.kind === "revision" ? `rev:${source.revision}` : source.kind;
}

export function useTree(repoPath: string, revision: string, folder: string | null, enabled = true) {
  return useQuery({
    queryKey: [...repoKeys.browse(repoPath), "tree", revision, folder],
    queryFn: () => listTree(repoPath, revision, folder),
    enabled,
    staleTime: 60_000,
  });
}

export function useFileContent(repoPath: string, source: FileSource | null, filePath: string | null) {
  return useQuery({
    queryKey: [...repoKeys.browse(repoPath), "file", source ? sourceKey(source) : null, filePath],
    queryFn: () => {
      if (!source || !filePath) {
        throw new Error("No file selected");
      }
      return readFileAt(repoPath, source, filePath);
    },
    enabled: source !== null && filePath !== null,
    staleTime: source?.kind === "revision" ? 60_000 : 0,
  });
}
