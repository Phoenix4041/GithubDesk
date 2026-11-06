import type { LanguageSupport } from "@codemirror/language";
import { FileX, FileQuestion, FileDiff as FileDiffIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { highlightLine } from "@/shared/lib/syntax";
import type { FileDiff, LineSelection } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { EmptyState } from "@/shared/ui/empty-state";
import { VirtualList } from "@/shared/ui/virtual-list";
import { buildDiffRows, changeLineIndices, isChangeLine, lineKey, longestLineLength, selectionsFromKeys } from "../diff-model";
import type { DiffRow } from "../diff-model";
import { useLanguageSupport } from "../use-language-support";

const ROW_HEIGHT = 20;
const GUTTER_WIDTH = 28 + 44 + 44 + 16;
const CHARACTER_WIDTH = 7.4;
const EMPTY_KEYS: ReadonlySet<string> = new Set();

export interface StagingControls {
  mode: "stage" | "unstage";
  busy: boolean;
  onApply: (selections: LineSelection[]) => void;
}

interface DiffViewerProps {
  diff: FileDiff;
  staging?: StagingControls;
}

interface SelectionState {
  owner: FileDiff;
  keys: ReadonlySet<string>;
}

interface DiffLineRowProps {
  row: Extract<DiffRow, { kind: "line" }>;
  support: LanguageSupport | null;
  selectable: boolean;
  selected: boolean;
  onToggle: (hunkIndex: number, lineIndex: number) => void;
  selectLabel: string;
  noNewlineLabel: string;
}

const DiffLineRow = memo(function DiffLineRow({
  row,
  support,
  selectable,
  selected,
  onToggle,
  selectLabel,
  noNewlineLabel,
}: DiffLineRowProps) {
  const { line } = row;
  const text = line.content.replace(/\r$/, "");
  const segments = useMemo(
    () => (support && line.kind !== "noNewline" ? highlightLine(support, text) : [{ text, className: null }]),
    [support, text, line.kind],
  );

  const isAdded = line.kind === "added";
  const isRemoved = line.kind === "removed";

  return (
    <div
      className={cn(
        "flex h-5 font-mono text-xs leading-5",
        isAdded && "bg-add-bg",
        isRemoved && "bg-del-bg",
        selected && "ring-1 ring-accent/50 ring-inset",
      )}
    >
      <span className={cn("grid w-7 shrink-0 place-items-center", isAdded && "bg-add-strong/60", isRemoved && "bg-del-strong/60")}>
        {selectable && isChangeLine(line) ? (
          <Checkbox
            label={selectLabel}
            checked={selected}
            onChange={() => onToggle(row.hunkIndex, row.lineIndex)}
            className="size-3"
          />
        ) : null}
      </span>
      <span className={cn("w-11 shrink-0 pr-2 text-right text-muted/80 tabular-nums", isAdded && "bg-add-strong/60", isRemoved && "bg-del-strong/60")}>
        {line.oldNumber ?? ""}
      </span>
      <span className={cn("w-11 shrink-0 pr-2 text-right text-muted/80 tabular-nums", isAdded && "bg-add-strong/60", isRemoved && "bg-del-strong/60")}>
        {line.newNumber ?? ""}
      </span>
      <span className={cn("w-4 shrink-0 text-center", isAdded && "text-add", isRemoved && "text-del")}>
        {isAdded ? "+" : isRemoved ? "-" : ""}
      </span>
      {line.kind === "noNewline" ? (
        <span className="pr-4 whitespace-pre text-muted italic">{noNewlineLabel}</span>
      ) : (
        <span className="selectable pr-4 whitespace-pre">
          {segments.map((segment, index) => (
            <span key={index} className={segment.className ?? undefined}>
              {segment.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
});

export function DiffViewer({ diff, staging }: DiffViewerProps) {
  const { t } = useTranslation();
  const support = useLanguageSupport(diff.path);
  const [selection, setSelection] = useState<SelectionState>({ owner: diff, keys: EMPTY_KEYS });

  const rows = useMemo(() => buildDiffRows(diff), [diff]);
  const selectable = Boolean(staging) && diff.partialStagingAllowed;
  const activeKeys = selection.owner === diff ? selection.keys : EMPTY_KEYS;

  const toggleLine = useCallback(
    (hunkIndex: number, lineIndex: number) => {
      setSelection((current) => {
        const base = current.owner === diff ? current.keys : EMPTY_KEYS;
        const next = new Set(base);
        const key = lineKey(hunkIndex, lineIndex);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return { owner: diff, keys: next };
      });
    },
    [diff],
  );

  const clearSelection = useCallback(() => setSelection({ owner: diff, keys: EMPTY_KEYS }), [diff]);

  function applyHunk(hunkIndex: number) {
    const hunk = diff.hunks[hunkIndex];
    if (hunk && staging) {
      staging.onApply([{ hunkIndex, lineIndices: changeLineIndices(hunk) }]);
    }
  }

  if (diff.binary) {
    return <EmptyState icon={<FileQuestion className="size-5" />} title={t("diff.binary.title")} description={t("diff.binary.description")} />;
  }
  if (diff.tooLarge) {
    return <EmptyState icon={<FileX className="size-5" />} title={t("diff.tooLarge.title")} description={t("diff.tooLarge.description")} />;
  }
  if (diff.hunks.length === 0) {
    return <EmptyState icon={<FileDiffIcon className="size-5" />} title={t("diff.noContentChanges.title")} description={t("diff.noContentChanges.description")} />;
  }

  const innerMinWidth = GUTTER_WIDTH + longestLineLength(diff) * CHARACTER_WIDTH + 32;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {staging && activeKeys.size > 0 ? (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-accent-soft/50 px-3 py-1.5">
          <p className="text-xs font-medium" role="status">
            {t("diff.selectedLines", { count: activeKeys.size })}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={clearSelection} disabled={staging.busy}>
              {t("diff.clearSelection")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={staging.busy}
              onClick={() => staging.onApply(selectionsFromKeys(activeKeys))}
            >
              {staging.mode === "stage" ? t("diff.stageSelection") : t("diff.unstageSelection")}
            </Button>
          </div>
        </div>
      ) : null}
      <VirtualList
        items={rows}
        rowHeight={ROW_HEIGHT}
        overscan={24}
        innerMinWidth={innerMinWidth}
        ariaLabel={t("diff.label", { path: diff.path })}
        getKey={(row) => (row.kind === "hunk" ? `h${row.hunkIndex}` : `l${row.hunkIndex}:${row.lineIndex}`)}
        renderRow={(row) => {
          if (row.kind === "hunk") {
            return (
              <div className="flex h-5 items-center bg-hunk-bg font-mono text-xs text-muted">
                <div className="sticky left-0 flex items-center gap-2 pl-2">
                  {staging && selectable && row.changeCount > 0 ? (
                    <button
                      type="button"
                      disabled={staging.busy}
                      onClick={() => applyHunk(row.hunkIndex)}
                      className="cursor-pointer rounded bg-surface px-1.5 text-[11px] font-medium text-accent transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {staging.mode === "stage" ? t("diff.stageHunk") : t("diff.unstageHunk")}
                    </button>
                  ) : null}
                  <span className="whitespace-pre">{row.header}</span>
                </div>
              </div>
            );
          }
          return (
            <DiffLineRow
              row={row}
              support={support}
              selectable={selectable}
              selected={activeKeys.has(lineKey(row.hunkIndex, row.lineIndex))}
              onToggle={toggleLine}
              selectLabel={t("diff.selectLine")}
              noNewlineLabel={t("diff.noNewline")}
            />
          );
        }}
      />
    </div>
  );
}
