import { useTranslation } from "react-i18next";
import { FileDiffPanel } from "@/features/diff/components/file-diff-panel";
import { useSettingsStore } from "@/features/settings/store";
import { useCommitFileDiff } from "../queries";
import { useHistoryStore } from "../store";

interface HistoryDiffPanelProps {
  repoPath: string;
}

export function HistoryDiffPanel({ repoPath }: HistoryDiffPanelProps) {
  const { t } = useTranslation();
  const selectedHash = useHistoryStore((state) => state.selectedHash);
  const selectedFile = useHistoryStore((state) => state.selectedFile);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);

  const target =
    selectedHash && selectedFile
      ? { hash: selectedHash, path: selectedFile.path, oldPath: selectedFile.oldPath }
      : null;
  const query = useCommitFileDiff(repoPath, target, ignoreWhitespace);

  return <FileDiffPanel target={target} query={query} placeholder={t("history.selectFile")} />;
}
