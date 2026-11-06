import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface VirtualListProps<T> {
  items: readonly T[];
  rowHeight: number;
  getKey: (item: T, index: number) => string | number;
  renderRow: (item: T, index: number) => ReactNode;
  ariaLabel?: string;
  className?: string;
  overscan?: number;
  innerMinWidth?: number;
  onNearEnd?: () => void;
}

const NEAR_END_THRESHOLD = 12;

export function VirtualList<T>({
  items,
  rowHeight,
  getKey,
  renderRow,
  ariaLabel,
  className,
  overscan = 8,
  innerMinWidth,
  onNearEnd,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems.length > 0 ? (virtualItems[virtualItems.length - 1]?.index ?? 0) : -1;

  useEffect(() => {
    if (onNearEnd && items.length > 0 && lastVisibleIndex >= items.length - NEAR_END_THRESHOLD) {
      onNearEnd();
    }
  }, [lastVisibleIndex, items.length, onNearEnd]);

  return (
    <div ref={scrollRef} role="list" aria-label={ariaLabel} className={cn("min-h-0 flex-1 overflow-auto", className)}>
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize(), minWidth: innerMinWidth }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (item === undefined) {
            return null;
          }
          return (
            <div
              key={getKey(item, virtualItem.index)}
              role="listitem"
              className="absolute top-0 left-0 w-full"
              style={{ height: rowHeight, transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderRow(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
