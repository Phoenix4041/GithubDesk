import { Plus } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface CommentButtonProps {
  count: number;
  label: string;
  onClick: () => void;
}

export function CommentButton({ count, label, onClick }: CommentButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-4 cursor-pointer place-items-center rounded transition-opacity duration-150 focus-visible:opacity-100",
        count > 0
          ? "bg-accent text-accent-fg opacity-100 hover:bg-accent-hover"
          : "text-muted opacity-0 group-hover/line:opacity-100 hover:bg-accent-soft hover:text-accent",
      )}
    >
      {count > 0 ? <span className="text-[10px] leading-none font-semibold tabular-nums">{count}</span> : <Plus className="size-3" />}
    </button>
  );
}
