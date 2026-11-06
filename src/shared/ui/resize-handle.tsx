import { useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

const KEYBOARD_STEP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ResizeHandle({ label, value, min, max, onChange }: ResizeHandleProps) {
  const dragStart = useRef<{ pointerX: number; startValue: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerX: event.clientX, startValue: value };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (start) {
      onChange(clamp(start.startValue + event.clientX - start.pointerX, min, max));
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(clamp(value - KEYBOARD_STEP, min, max));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onChange(clamp(value + KEYBOARD_STEP, min, max));
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="group relative z-10 -mx-[3px] w-[7px] shrink-0 cursor-col-resize touch-none"
    >
      <div className="mx-auto h-full w-px bg-line transition-colors duration-150 group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" />
    </div>
  );
}
