import { Columns2, Rows2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/icon-button";

interface DiffOptionsProps {
  hideWhitespace?: boolean;
}

export function DiffOptions({ hideWhitespace = false }: DiffOptionsProps) {
  const { t } = useTranslation();
  const diffMode = useSettingsStore((state) => state.diffMode);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);
  const setDiffMode = useSettingsStore((state) => state.setDiffMode);
  const setIgnoreWhitespace = useSettingsStore((state) => state.setIgnoreWhitespace);
  const wordDiff = useSettingsStore((state) => state.wordDiff);
  const setWordDiff = useSettingsStore((state) => state.setWordDiff);

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-pressed={wordDiff}
        title={t("diff.wordDiffHint")}
        onClick={() => setWordDiff(!wordDiff)}
        className={cn(
          "h-7 cursor-pointer rounded-md px-2 text-xs font-medium transition-colors duration-150",
          wordDiff ? "bg-accent-soft text-accent" : "text-muted hover:bg-subtle hover:text-fg",
        )}
      >
        {t("diff.wordDiff")}
      </button>
      {hideWhitespace ? null : (
        <button
          type="button"
          aria-pressed={ignoreWhitespace}
          title={t("diff.ignoreWhitespaceHint")}
          onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}
          className={cn(
            "h-7 cursor-pointer rounded-md px-2 text-xs font-medium transition-colors duration-150",
            ignoreWhitespace ? "bg-accent-soft text-accent" : "text-muted hover:bg-subtle hover:text-fg",
          )}
        >
          {t("diff.ignoreWhitespace")}
        </button>
      )}
      <div role="group" aria-label={t("diff.modeLabel")} className="flex items-center">
        <IconButton
          label={t("diff.mode.unified")}
          active={diffMode === "unified"}
          aria-pressed={diffMode === "unified"}
          onClick={() => setDiffMode("unified")}
        >
          <Rows2 className="size-4" />
        </IconButton>
        <IconButton
          label={t("diff.mode.split")}
          active={diffMode === "split"}
          aria-pressed={diffMode === "split"}
          onClick={() => setDiffMode("split")}
        >
          <Columns2 className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
