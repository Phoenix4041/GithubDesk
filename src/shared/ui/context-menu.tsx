import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cn } from "@/shared/lib/cn";

export type ContextMenuEntry =
  | {
      kind?: "item";
      label: string;
      icon?: ReactNode;
      disabled?: boolean;
      destructive?: boolean;
      onSelect: () => void;
    }
  | { kind: "separator" };

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  show: (x: number, y: number, entries: ContextMenuEntry[]) => void;
  hide: () => void;
}

const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  entries: [],
  show: (x, y, entries) => set({ open: true, x, y, entries }),
  hide: () => set({ open: false }),
}));

const VIEWPORT_MARGIN = 8;

export function openContextMenu(event: ReactMouseEvent, entries: ContextMenuEntry[]): void {
  event.preventDefault();
  event.stopPropagation();
  const usable = entries.filter((entry) => entry.kind === "separator" || entry.label.length > 0);
  if (usable.length === 0) {
    return;
  }
  useContextMenuStore.getState().show(event.clientX, event.clientY, usable);
}

export function ContextMenuHost() {
  const open = useContextMenuStore((state) => state.open);
  const x = useContextMenuStore((state) => state.x);
  const y = useContextMenuStore((state) => state.y);
  const entries = useContextMenuStore((state) => state.entries);
  const hide = useContextMenuStore((state) => state.hide);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const menu = menuRef.current;
    const width = menu?.offsetWidth ?? 0;
    const height = menu?.offsetHeight ?? 0;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
    setPosition({ left, top });
  }, [open, x, y, entries]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        hide();
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        hide();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape, true);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(currentIndex + step + items.length) % items.length];
    event.preventDefault();
    next?.focus();
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position.left, top: position.top }}
      className="fixed z-[60] flex min-w-52 animate-[pop-in_150ms_var(--ease-out-expo)] flex-col rounded-lg border border-line bg-surface p-1 shadow-xl"
    >
      {entries.map((entry, index) => {
        if (entry.kind === "separator") {
          return <div key={`separator-${index}`} role="separator" className="my-1 h-px bg-line" />;
        }
        return (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100",
              "hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
              entry.destructive && "text-danger",
            )}
            onClick={() => {
              hide();
              entry.onSelect();
            }}
          >
            <span className={cn("grid size-4 place-items-center", entry.destructive ? "text-danger" : "text-muted")}>
              {entry.icon}
            </span>
            {entry.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
