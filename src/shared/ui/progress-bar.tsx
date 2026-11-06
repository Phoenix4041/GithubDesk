import { cn } from "@/shared/lib/cn";

interface ProgressBarProps {
  percent: number | null;
  label: string;
  className?: string;
}

export function ProgressBar({ percent, label, className }: ProgressBarProps) {
  const determinate = percent !== null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(percent) : undefined}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-subtle", className)}
    >
      {determinate ? (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      ) : (
        <div className="h-full w-2/5 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
      )}
    </div>
  );
}
