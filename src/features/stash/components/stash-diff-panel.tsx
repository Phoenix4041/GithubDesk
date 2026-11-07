import { useTranslation } from "react-i18next";
import { FileDiffPanel } from "@/features/diff/components/file-diff-panel";
import { useSettingsStore } from "@/features/settings/store";
import { useStashFileDiff } from "../queries";
import { useStashStore } from "../store";

interface StashDiffPanelProps {
  repoPath: string;
}

export function StashDiffPanel({ repoPath }: StashDiffPanelProps) {
  const { t } = useTranslation();
  const selectedHash = useStashStore((state) => state.selectedHash);
  const selectedFile = useStashStore((state) => state.selectedFile);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);

  const target =
    selectedHash && selectedFile
      ? { hash: selectedHash, path: selectedFile.path, oldPath: selectedFile.oldPath }
      : null;
  const query = useStashFileDiff(repoPath, target, ignoreWhitespace);

  return <FileDiffPanel target={target} query={query} placeholder={t("history.selectFile")} />;
}
