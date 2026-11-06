import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 animate-[fade-in_250ms_ease-out] flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-11 place-items-center rounded-xl bg-subtle text-muted">{icon}</div>
      <div className="flex max-w-[34ch] flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
