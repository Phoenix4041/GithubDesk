import { FileQuestion, FileX, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguageSupport } from "@/features/diff/use-language-support";
import { useHistoryStore } from "@/features/history/store";
import { useSettingsStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { splitPath } from "@/shared/lib/paths";
import { describeError } from "@/shared/lib/report-error";
import { highlightLine } from "@/shared/lib/syntax";
import { useUiStore } from "@/shared/lib/ui-store";
import type { BlameCommit, BlameLine } from "@/shared/types/git";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { SkeletonRows, useSkeletonVisible } from "@/shared/ui/skeleton";
import { VirtualList } from "@/shared/ui/virtual-list";
import { colorIndexFor, groupStarts, longestBlameLine } from "../blame-model";
import { useBlame } from "../queries";
import { useBlameStore } from "../store";

const ROW_HEIGHT = 20;
const NUMBER_WIDTH = 52;
const INFO_WIDTH = 260;
const CHARACTER_WIDTH = 7.4;

interface BlamePanelProps {
  repoPath: string;
}

interface RowProps {
  line: BlameLine;
  number: number;
  commit: BlameCommit;
  first: boolean;
  hovered: boolean;
  support: ReturnType<typeof useLanguageSupport>;
  language: string;
  uncommittedLabel: string;
  onHover: (commitIndex: number | null) => void;
  onOpenCommit: (commit: BlameCommit) => void;
}

function BlameRow({ line, number, commit, first, hovered, support, language, uncommittedLabel, onHover, onOpenCommit }: RowProps) {
  const text = line.content;
  const segments = useMemo(
    () => (support ? highlightLine(support, text) : [{ text, className: null }]),
    [support, text],
  );
  const color = `var(--graph-${colorIndexFor(line.commitIndex)})`;

  return (
    <div
      onMouseEnter={() => onHover(line.commitIndex)}
      onMouseLeave={() => onHover(null)}
      className={cn("flex h-5 font-mono text-xs leading-5", hovered && "bg-subtle")}
    >
      <span className="w-[52px] shrink-0 pr-2 text-right text-muted/80 tabular-nums">{number}</span>
      <span aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: color }} />
      <button
        type="button"
        disabled={commit.uncommitted}
        onClick={() => onOpenCommit(commit)}
        title={commit.uncommitted ? uncommittedLabel : `${commit.summary}\n${commit.shortHash}`}
        className={cn(
          "flex shrink-0 items-center gap-2 px-2 text-left font-sans text-[11px]",
          commit.uncommitted ? "cursor-default text-muted italic" : "cursor-pointer hover:text-accent",
        )}
        style={{ width: INFO_WIDTH }}
      >
        {first ? (
          <>
            <span className="min-w-0 flex-1 truncate font-medium">{commit.uncommitted ? uncommittedLabel : commit.author}</span>
            {commit.uncommitted ? null : (
              <>
                <span className="shrink-0 text-muted">{formatRelativeTime(commit.authorTime, language)}</span>
                <span className="shrink-0 font-mono text-muted">{commit.shortHash}</span>
              </>
            )}
          </>
        ) : null}
      </button>
      <span className="selectable pr-4 whitespace-pre">
        {segments.map((segment, index) => (
          <span key={index} className={segment.className ?? undefined}>
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  );
}

export function BlamePanel({ repoPath }: BlamePanelProps) {
  const { t, i18n } = useTranslation();
  const target = useBlameStore((state) => state.target);
  const close = useBlameStore((state) => state.close);
  const ignoreWhitespace = useSettingsStore((state) => state.ignoreWhitespace);
  const selectCommit = useHistoryStore((state) => state.selectCommit);
  const setTab = useUiStore((state) => state.setTab);
  const blame = useBlame(repoPath, target, ignoreWhitespace);
  const support = useLanguageSupport(target?.path ?? "");
  const showSkeleton = useSkeletonVisible(blame.isPending);
  const [hoveredCommit, setHoveredCommit] = useState<number | null>(null);

  const starts = useMemo(() => groupStarts(blame.data?.lines ?? []), [blame.data]);
  const innerMinWidth = NUMBER_WIDTH + 4 + INFO_WIDTH + longestBlameLine(blame.data?.lines ?? []) * CHARACTER_WIDTH + 32;

  if (!target) {
    return null;
  }

  const { directory, fileName } = splitPath(target.path);
  const header = (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
      <h2 className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
        <span className="shrink-0 font-semibold">{fileName}</span>
        <span className="truncate text-xs text-muted" title={target.path}>
          {directory}
        </span>
      </h2>
      <span className="shrink-0 rounded-full bg-accent-soft px-2 py-px text-[11px] font-medium text-accent">
        {target.revision ? t("blame.atRevision", { hash: target.revision.slice(0, 7) }) : t("blame.title")}
      </span>
      <div className="ml-auto flex shrink-0 items-center">
        <IconButton label={t("blame.close")} onClick={close}>
          <X className="size-4" />
        </IconButton>
      </div>
    </header>
  );

  function openCommit(commit: BlameCommit) {
    selectCommit(commit.hash);
    setTab("history");
    close();
  }

  if (showSkeleton) {
    return (
      <>
        {header}
        <SkeletonRows count={16} rowHeight={20} />
      </>
    );
  }
  if (blame.isPending) {
    return header;
  }
  if (blame.isError) {
    const description = describeError(blame.error);
    return (
      <>
        {header}
        <ErrorState title={description.title} message={description.message} onRetry={() => void blame.refetch()} />
      </>
    );
  }

  const result = blame.data;
  if (result.binary) {
    return (
      <>
        {header}
        <EmptyState icon={<FileQuestion className="size-5" />} title={t("blame.binary.title")} description={t("blame.binary.description")} />
      </>
    );
  }
  if (result.tooLarge) {
    return (
      <>
        {header}
        <EmptyState icon={<FileX className="size-5" />} title={t("blame.tooLarge.title")} description={t("blame.tooLarge.description")} />
      </>
    );
  }
  if (result.lines.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={<FileX className="size-5" />} title={t("blame.empty.title")} description={t("blame.empty.description")} />
      </>
    );
  }

  return (
    <>
      {header}
      <VirtualList
        items={result.lines}
        rowHeight={ROW_HEIGHT}
        overscan={24}
        innerMinWidth={innerMinWidth}
        ariaLabel={t("blame.listLabel", { path: target.path })}
        getKey={(_, index) => index}
        renderRow={(line, index) => {
          const commit = result.commits[line.commitIndex];
          if (!commit) {
            return null;
          }
          return (
            <BlameRow
              line={line}
              number={index + 1}
              commit={commit}
              first={starts[index] ?? false}
              hovered={hoveredCommit === line.commitIndex}
              support={support}
              language={i18n.language}
              uncommittedLabel={t("blame.uncommitted")}
              onHover={setHoveredCommit}
              onOpenCommit={openCommit}
            />
          );
        }}
      />
      {result.truncated ? (
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{t("blame.truncated")}</p>
      ) : null}
    </>
  );
}
