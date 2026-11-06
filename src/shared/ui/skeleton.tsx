import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";

interface SkeletonProps {
  className?: string;
  width?: string;
}

export function Skeleton({ className, width }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={width ? { width } : undefined}
      className={cn("animate-[skeleton-pulse_1.4s_ease-in-out_infinite] rounded bg-subtle", className)}
    />
  );
}

const ROW_WIDTHS = ["72%", "58%", "84%", "66%", "49%", "78%", "61%", "90%"];

interface SkeletonRowsProps {
  count?: number;
  rowHeight?: number;
  className?: string;
}

export function SkeletonRows({ count = 8, rowHeight = 28, className }: SkeletonRowsProps) {
  return (
    <div className={cn("flex flex-col", className)} role="status" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-2 px-3" style={{ height: rowHeight }}>
          <Skeleton className="size-3.5 shrink-0" />
          <Skeleton className="h-3" width={ROW_WIDTHS[index % ROW_WIDTHS.length]} />
        </div>
      ))}
    </div>
  );
}

export function useSkeletonVisible(loading: boolean, delay = 150, minimumVisible = 300): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (loading) {
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (visible) {
      const remaining = Math.max(0, minimumVisible - (Date.now() - shownAt.current));
      const timer = window.setTimeout(() => setVisible(false), remaining);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loading, visible, delay, minimumVisible]);

  return visible;
}
