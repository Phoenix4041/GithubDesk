import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import type { CommitSummary } from "@/shared/types/git";
import { useHistoryStore } from "../store";
import { RefChips } from "./ref-chips";

interface CommitRowProps {
  commit: CommitSummary;
  selected: boolean;
}

export const CommitRow = memo(function CommitRow({ commit, selected }: CommitRowProps) {
  const { i18n } = useTranslation();
  const selectCommit = useHistoryStore((state) => state.selectCommit);

  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => selectCommit(commit.hash)}
      className={cn(
        "mx-1.5 flex h-[calc(100%-2px)] w-[calc(100%-12px)] cursor-pointer flex-col justify-center gap-0.5 rounded-md px-2.5 text-left transition-colors duration-150",
        selected ? "bg-accent-soft" : "hover:bg-subtle",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={commit.subject}>
          {commit.subject}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{commit.shortHash}</span>
      </span>
      <span className="flex items-center gap-1.5 overflow-hidden text-[11px] text-muted">
        <span className="truncate">{commit.authorName}</span>
        <span aria-hidden="true">&middot;</span>
        <span className="shrink-0">{formatRelativeTime(commit.authorTime, i18n.language)}</span>
        {commit.refs.length > 0 ? (
          <span className="ml-1 flex min-w-0 items-center gap-1">
            <RefChips refs={commit.refs} />
          </span>
        ) : null}
      </span>
    </button>
  );
});
