import { cn } from "@/shared/lib/cn";

interface SpinnerProps {
  className?: string;
}

export function Spinner({ className }: SpinnerProps) {
  return (
    <svg
      className={cn("size-3.5 animate-[spin_0.8s_linear_infinite]", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
