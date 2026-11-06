import { GitBranch, Tag } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { RefLabel } from "@/shared/types/git";

const MAX_VISIBLE_REFS = 3;

const kindClasses: Record<RefLabel["kind"], string> = {
  head: "bg-accent text-accent-fg",
  localBranch: "bg-accent-soft text-accent",
  remoteBranch: "bg-subtle text-muted",
  tag: "bg-warning/15 text-warning",
};

interface RefChipsProps {
  refs: RefLabel[];
}

export function RefChips({ refs }: RefChipsProps) {
  const visible = refs.slice(0, MAX_VISIBLE_REFS);
  const hidden = refs.length - visible.length;

  return (
    <>
      {visible.map((label) => (
        <span
          key={`${label.kind}:${label.name}`}
          className={cn(
            "inline-flex max-w-[160px] items-center gap-1 rounded px-1.5 py-px text-[10px] leading-4 font-medium",
            kindClasses[label.kind],
          )}
        >
          {label.kind === "tag" ? <Tag className="size-2.5 shrink-0" /> : null}
          {label.kind === "localBranch" || label.kind === "remoteBranch" ? <GitBranch className="size-2.5 shrink-0" /> : null}
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {hidden > 0 ? <span className="text-[10px] text-muted">+{hidden}</span> : null}
    </>
  );
}
