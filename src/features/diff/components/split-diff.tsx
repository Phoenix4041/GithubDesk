import type { LanguageSupport } from "@codemirror/language";
import { CornerDownLeft } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { highlightLine } from "@/shared/lib/syntax";
import type { FileDiff } from "@/shared/types/git";
import { VirtualList } from "@/shared/ui/virtual-list";
import { buildSplitRows, longestLineLength } from "../diff-model";
import type { SplitCell, SplitRow } from "../diff-model";
import type { StagingControls } from "../staging-controls";
import { HunkHeaderRow } from "./hunk-header-row";

const ROW_HEIGHT = 20;
const NUMBER_WIDTH = 44;
const MARKER_WIDTH = 16;
const CHARACTER_WIDTH = 7.4;

interface SplitCellViewProps {
  cell: SplitCell | null;
  side: "left" | "right";
  support: LanguageSupport | null;
  noNewlineLabel: string;
}

const SplitCellView = memo(function SplitCellView({ cell, side, support, noNewlineLabel }: SplitCellViewProps) {
  const text = cell ? cell.line.content.replace(/\r$/, "") : "";
  const segments = useMemo(
    () => (support ? highlightLine(support, text) : [{ text, className: null }]),
    [support, text],
  );

  if (!cell) {
    return <div aria-hidden="true" className={cn("min-w-0 flex-1 bg-subtle/50", side === "right" && "border-l border-line")} />;
  }

  const isAdded = cell.line.kind === "added";
  const isRemoved = cell.line.kind === "removed";
  const number = side === "left" ? cell.line.oldNumber : cell.line.newNumber;
  const strong = cn(isAdded && "bg-add-strong/60", isRemoved && "bg-del-strong/60");

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1",
        side === "right" && "border-l border-line",
        isAdded && "bg-add-bg",
        isRemoved && "bg-del-bg",
      )}
    >
      <span className={cn("w-11 shrink-0 pr-2 text-right text-muted/80 tabular-nums", strong)}>{number ?? ""}</span>
      <span className={cn("w-4 shrink-0 text-center", isAdded && "text-add", isRemoved && "text-del")}>
        {isAdded ? "+" : isRemoved ? "-" : ""}
      </span>
      <span className="selectable pr-4 whitespace-pre">
        {segments.map((segment, index) => (
          <span key={index} className={segment.className ?? undefined}>
            {segment.text}
          </span>
        ))}
      </span>
      {cell.missingNewline ? (
        <span className="grid shrink-0 place-items-center pr-2 text-muted" title={noNewlineLabel}>
          <CornerDownLeft className="size-3" aria-label={noNewlineLabel} />
        </span>
      ) : null}
    </div>
  );
});

interface SplitDiffProps {
  diff: FileDiff;
  support: LanguageSupport | null;
  staging?: StagingControls;
  selectable: boolean;
  onApplyHunk: (hunkIndex: number) => void;
}

function rowKey(row: SplitRow): string {
  return row.kind === "hunk" ? `h${row.hunkIndex}` : `p${row.hunkIndex}:${row.rowIndex}`;
}

export function SplitDiff({ diff, support, staging, selectable, onApplyHunk }: SplitDiffProps) {
  const { t } = useTranslation();
  const rows = useMemo(() => buildSplitRows(diff), [diff]);
  const halfWidth = NUMBER_WIDTH + MARKER_WIDTH + longestLineLength(diff) * CHARACTER_WIDTH + 48;
  const noNewlineLabel = t("diff.noNewline");

  return (
    <VirtualList
      items={rows}
      rowHeight={ROW_HEIGHT}
      overscan={24}
      innerMinWidth={halfWidth * 2}
      ariaLabel={t("diff.label", { path: diff.path })}
      getKey={rowKey}
      renderRow={(row) => {
        if (row.kind === "hunk") {
          return (
            <HunkHeaderRow
              header={row.header}
              hunkIndex={row.hunkIndex}
              changeCount={row.changeCount}
              staging={staging}
              selectable={selectable}
              onApplyHunk={onApplyHunk}
            />
          );
        }
        return (
          <div className="flex h-5 font-mono text-xs leading-5">
            <SplitCellView cell={row.left} side="left" support={support} noNewlineLabel={noNewlineLabel} />
            <SplitCellView cell={row.right} side="right" support={support} noNewlineLabel={noNewlineLabel} />
          </div>
        );
      }}
    />
  );
}
