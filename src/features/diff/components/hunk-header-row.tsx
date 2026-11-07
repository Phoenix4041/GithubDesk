import { useTranslation } from "react-i18next";
import type { StagingControls } from "../staging-controls";

interface HunkHeaderRowProps {
  header: string;
  hunkIndex: number;
  changeCount: number;
  staging?: StagingControls;
  selectable: boolean;
  onApplyHunk: (hunkIndex: number) => void;
}

export function HunkHeaderRow({ header, hunkIndex, changeCount, staging, selectable, onApplyHunk }: HunkHeaderRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-5 items-center bg-hunk-bg font-mono text-xs text-muted">
      <div className="sticky left-0 flex items-center gap-2 pl-2">
        {staging && selectable && changeCount > 0 ? (
          <button
            type="button"
            disabled={staging.busy}
            onClick={() => onApplyHunk(hunkIndex)}
            className="cursor-pointer rounded bg-surface px-1.5 text-[11px] font-medium text-accent transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {staging.mode === "stage" ? t("diff.stageHunk") : t("diff.unstageHunk")}
          </button>
        ) : null}
        <span className="whitespace-pre">{header}</span>
      </div>
    </div>
  );
}
