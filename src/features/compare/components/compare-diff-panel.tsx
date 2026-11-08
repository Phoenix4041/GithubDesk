import { useTranslation } from "react-i18next";
import { FileDiffPanel } from "@/features/diff/components/file-diff-panel";
import { useSettingsStore } from "@/features/settings/store";
import { useCompareFileDiff, useCompareSummary } from "../queries";
import { useCompareStore } from "../store";

interface CompareDiffPanelProps {
  repoPath: string;
}

export function CompareDiffPanel({ repoPath }: CompareDiffPanelProps) {
  const { t } = useTranslation();
  const base = useCompareStore((state) => state.base);
  const head = useCompareStore((state) => state.head);
  const exact = useCompareStore((state) => state.exact);
  const selectedFile = useCompareStore((state) => state.selectedFile);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);
  const summary = useCompareSummary(repoPath, { base, head });

  const target = selectedFile ? { base, head, exact, path: selectedFile.path, oldPath: selectedFile.oldPath } : null;
  const query = useCompareFileDiff(repoPath, target, ignoreWhitespace);
  const beforeRevision = exact ? base : (summary.data?.mergeBase ?? base);
  const images =
    selectedFile && beforeRevision && head
      ? {
          repoPath,
          sides: {
            before: { source: { kind: "revision", revision: beforeRevision } as const, path: selectedFile.oldPath ?? selectedFile.path },
            after: { source: { kind: "revision", revision: head } as const, path: selectedFile.path },
          },
        }
      : null;

  return <FileDiffPanel target={target} query={query} placeholder={t("history.selectFile")} images={images} />;
}
