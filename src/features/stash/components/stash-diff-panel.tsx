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
  const images = target
    ? {
        repoPath,
        sides: {
          before: { source: { kind: "revision", revision: `${target.hash}^1` } as const, path: target.oldPath ?? target.path },
          after: { source: { kind: "revision", revision: target.hash } as const, path: target.path },
        },
      }
    : null;

  return <FileDiffPanel target={target} query={query} placeholder={t("history.selectFile")} images={images} />;
}
