import { useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/shared/lib/cn";

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  orientation?: "vertical" | "horizontal";
}

const KEYBOARD_STEP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ResizeHandle({ label, value, min, max, onChange, orientation = "vertical" }: ResizeHandleProps) {
  const dragStart = useRef<{ pointer: number; startValue: number } | null>(null);
  const horizontal = orientation === "horizontal";

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>): number {
    return horizontal ? event.clientY : event.clientX;
  }

  function delta(event: ReactPointerEvent<HTMLDivElement>, start: number): number {
    const moved = pointerPosition(event) - start;
    return horizontal ? -moved : moved;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointer: pointerPosition(event), startValue: value };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (start) {
      onChange(clamp(start.startValue + delta(event, start.pointer), min, max));
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const grow = horizontal ? "ArrowUp" : "ArrowRight";
    const shrink = horizontal ? "ArrowDown" : "ArrowLeft";
    if (event.key === shrink) {
      event.preventDefault();
      onChange(clamp(value - KEYBOARD_STEP, min, max));
    } else if (event.key === grow) {
      event.preventDefault();
      onChange(clamp(value + KEYBOARD_STEP, min, max));
    }
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative z-10 shrink-0 touch-none",
        horizontal ? "-my-[3px] h-[7px] cursor-row-resize" : "-mx-[3px] w-[7px] cursor-col-resize",
      )}
    >
      <div
        className={cn(
          "bg-line transition-colors duration-150 group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent",
          horizontal ? "my-auto h-px w-full translate-y-[3px]" : "mx-auto h-full w-px",
        )}
      />
    </div>
  );
}
