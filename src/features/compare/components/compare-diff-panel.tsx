import { useTranslation } from "react-i18next";
import { FileDiffPanel } from "@/features/diff/components/file-diff-panel";
import { useSettingsStore } from "@/features/settings/store";
import { useCompareFileDiff } from "../queries";
import { useCompareStore } from "../store";

interface CompareDiffPanelProps {
  repoPath: string;
}

export function CompareDiffPanel({ repoPath }: CompareDiffPanelProps) {
  const { t } = useTranslation();
  const base = useCompareStore((state) => state.base);
  const head = useCompareStore((state) => state.head);
  const selectedFile = useCompareStore((state) => state.selectedFile);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);

  const target = selectedFile ? { base, head, path: selectedFile.path, oldPath: selectedFile.oldPath } : null;
  const query = useCompareFileDiff(repoPath, target, ignoreWhitespace);

  return <FileDiffPanel target={target} query={query} placeholder={t("history.selectFile")} />;
}
