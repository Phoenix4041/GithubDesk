import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "./icon-button";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

interface MenuProps {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
}

export function Menu({ label, trigger, items, align = "right" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      containerRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const entries = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const currentIndex = entries.findIndex((entry) => entry === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = entries[(currentIndex + step + entries.length) % entries.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <IconButton
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        active={open}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </IconButton>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute top-full z-40 mt-1 flex min-w-48 animate-[pop-in_150ms_var(--ease-out-expo)] flex-col rounded-lg border border-line bg-surface p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100 hover:bg-subtle focus-visible:bg-subtle"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span className="text-muted">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
