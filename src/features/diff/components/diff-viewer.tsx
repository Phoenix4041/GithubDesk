import type { LanguageSupport } from "@codemirror/language";
import { FileX, FileQuestion, FileDiff as FileDiffIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { highlightLine } from "@/shared/lib/syntax";
import type { FileDiff } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { EmptyState } from "@/shared/ui/empty-state";
import { VirtualList } from "@/shared/ui/virtual-list";
import { buildDiffRows, changeLineIndices, isChangeLine, lineKey, longestLineLength, selectionsFromKeys } from "../diff-model";
import { commentKey, lineAnchor } from "../line-comments";
import type { DiffSide, LineCommentControls } from "../line-comments";
import { applyWordRanges, computeWordRanges, wordKey } from "../word-diff";
import type { WordRange } from "../word-diff";
import type { DiffRow } from "../diff-model";
import type { StagingControls } from "../staging-controls";
import { useLanguageSupport } from "../use-language-support";
import { CommentButton } from "./comment-button";
import { HunkHeaderRow } from "./hunk-header-row";
import { SplitDiff } from "./split-diff";

const ROW_HEIGHT = 20;
const GUTTER_WIDTH = 28 + 44 + 44 + 16;
const CHARACTER_WIDTH = 7.4;
const EMPTY_KEYS: ReadonlySet<string> = new Set();
const NO_WORD_RANGES: ReadonlyMap<string, WordRange[]> = new Map();

interface DiffViewerProps {
  diff: FileDiff;
  staging?: StagingControls;
  comments?: LineCommentControls;
}

interface SelectionState {
  owner: FileDiff;
  keys: ReadonlySet<string>;
}

interface DiffLineRowProps {
  row: Extract<DiffRow, { kind: "line" }>;
  support: LanguageSupport | null;
  ranges: readonly WordRange[] | undefined;
  selectable: boolean;
  selected: boolean;
  onToggle: (hunkIndex: number, lineIndex: number) => void;
  selectLabel: string;
  noNewlineLabel: string;
  commentSide: DiffSide | null;
  commentLine: number | null;
  commentCount: number;
  commentLabel: string;
  onComment: ((side: DiffSide, line: number) => void) | undefined;
}

const DiffLineRow = memo(function DiffLineRow({
  row,
  support,
  ranges,
  selectable,
  selected,
  onToggle,
  selectLabel,
  noNewlineLabel,
  commentSide,
  commentLine,
  commentCount,
  commentLabel,
  onComment,
}: DiffLineRowProps) {
  const { line } = row;
  const text = line.content.replace(/\r$/, "");
  const segments = useMemo(() => {
    const base = support && line.kind !== "noNewline" ? highlightLine(support, text) : [{ text, className: null }];
    return applyWordRanges(base, ranges);
  }, [support, text, line.kind, ranges]);

  const isAdded = line.kind === "added";
  const isRemoved = line.kind === "removed";

  return (
    <div
      className={cn(
        "group/line flex h-5 font-mono text-xs leading-5",
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
        ) : onComment && commentSide && commentLine !== null ? (
          <CommentButton count={commentCount} label={commentLabel} onClick={() => onComment(commentSide, commentLine)} />
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
            <span
              key={index}
              className={cn(
                segment.className,
                segment.changed && "rounded-[2px]",
                segment.changed && isAdded && "bg-add-strong",
                segment.changed && isRemoved && "bg-del-strong",
              )}
            >
              {segment.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
});

export function DiffViewer({ diff, staging, comments }: DiffViewerProps) {
  const { t } = useTranslation();
  const support = useLanguageSupport(diff.path);
  const [selection, setSelection] = useState<SelectionState>({ owner: diff, keys: EMPTY_KEYS });

  const diffMode = useSettingsStore((state) => state.diffMode);
  const wordDiffEnabled = useSettingsStore((state) => state.wordDiff);
  const rows = useMemo(() => (diffMode === "unified" ? buildDiffRows(diff) : []), [diff, diffMode]);
  const wordRanges = useMemo(
    () => (wordDiffEnabled && diffMode === "unified" ? computeWordRanges(diff) : NO_WORD_RANGES),
    [diff, diffMode, wordDiffEnabled],
  );
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

  if (diffMode === "split") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SplitDiff
          diff={diff}
          support={support}
          staging={staging}
          comments={comments}
          selectable={selectable}
          onApplyHunk={applyHunk}
        />
      </div>
    );
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
              <HunkHeaderRow
                header={row.header}
                hunkIndex={row.hunkIndex}
                changeCount={row.changeCount}
                staging={staging}
                selectable={selectable}
                onApplyHunk={applyHunk}
              />
            );
          }
          const anchor = comments ? lineAnchor(row.line) : null;
          const commentCount = anchor ? (comments?.counts.get(commentKey(anchor.side, anchor.line)) ?? 0) : 0;
          return (
            <DiffLineRow
              row={row}
              support={support}
              ranges={wordRanges.get(wordKey(row.hunkIndex, row.lineIndex))}
              selectable={selectable}
              selected={activeKeys.has(lineKey(row.hunkIndex, row.lineIndex))}
              onToggle={toggleLine}
              selectLabel={t("diff.selectLine")}
              noNewlineLabel={t("diff.noNewline")}
              commentSide={anchor?.side ?? null}
              commentLine={anchor?.line ?? null}
              commentCount={commentCount}
              commentLabel={commentCount > 0 ? t("diff.comment.view", { count: commentCount }) : t("diff.comment.add")}
              onComment={comments?.onOpen}
            />
          );
        }}
      />
    </div>
  );
}
