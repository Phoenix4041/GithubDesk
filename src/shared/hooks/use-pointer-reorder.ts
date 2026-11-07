import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { indexAtPosition } from "@/shared/lib/reorder";

interface PointerReorderOptions {
  onMove: (from: number, to: number) => void;
  count: number;
  disabled?: boolean;
}

export interface GripProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export function usePointerReorder({ onMove, count, disabled = false }: PointerReorderOptions) {
  const listRef = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const draggingRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  const active = dragging !== null;

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    function handleMove(event: PointerEvent) {
      const list = listRef.current;
      const current = draggingRef.current;
      if (!list || current === null) {
        return;
      }
      const bounds = Array.from(list.children).map((child) => child.getBoundingClientRect());
      const target = indexAtPosition(bounds, event.clientY);
      if (target !== current) {
        onMoveRef.current(current, target);
        draggingRef.current = target;
        setDragging(target);
      }
    }
    function stop() {
      draggingRef.current = null;
      setDragging(null);
    }
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [active]);

  const startDrag = useCallback((index: number) => {
    draggingRef.current = index;
    setDragging(index);
  }, []);

  const moveBy = useCallback((index: number, delta: number) => {
    onMoveRef.current(index, index + delta);
  }, []);

  function gripProps(index: number): GripProps {
    return {
      onPointerDown: (event) => {
        if (disabled || event.button !== 0) {
          return;
        }
        event.preventDefault();
        startDrag(index);
      },
      onKeyDown: (event) => {
        if (disabled) {
          return;
        }
        if (event.key === "ArrowUp" && index > 0) {
          event.preventDefault();
          moveBy(index, -1);
        } else if (event.key === "ArrowDown" && index < count - 1) {
          event.preventDefault();
          moveBy(index, 1);
        }
      },
    };
  }

  return { listRef, dragging, gripProps };
}
