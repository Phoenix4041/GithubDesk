import { cn } from "@/shared/lib/cn";
import type { ChangeKind } from "@/shared/types/git";
import { badgeFor } from "../change-model";
import type { ChangeBadge } from "../change-model";

const toneClasses: Record<ChangeBadge["tone"], string> = {
  success: "bg-add-bg text-add",
  warning: "bg-warning/15 text-warning",
  danger: "bg-del-bg text-del",
  accent: "bg-accent-soft text-accent",
  muted: "bg-subtle text-muted",
};

interface ChangeBadgeProps {
  kind: ChangeKind;
  label: string;
  className?: string;
}

export function ChangeKindBadge({ kind, label, className }: ChangeBadgeProps) {
  const badge = badgeFor(kind);
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded text-[10px] leading-none font-bold",
        toneClasses[badge.tone],
        className,
      )}
    >
      {badge.letter}
    </span>
  );
}
