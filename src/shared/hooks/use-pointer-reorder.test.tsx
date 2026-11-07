import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePointerReorder } from "./use-pointer-reorder";

function pointerDown(button = 0) {
  const preventDefault = vi.fn();
  return { event: { button, preventDefault } as unknown as ReactPointerEvent<HTMLElement>, preventDefault };
}

function key(name: string) {
  const preventDefault = vi.fn();
  return { event: { key: name, preventDefault } as unknown as ReactKeyboardEvent<HTMLElement>, preventDefault };
}

function attachList(result: { current: { listRef: { current: HTMLOListElement | null } } }) {
  const list = document.createElement("ol");
  for (let index = 0; index < 3; index += 1) {
    const row = document.createElement("li");
    const top = index * 50;
    row.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40, x: 0, y: top, toJSON: () => ({}) });
    list.appendChild(row);
  }
  result.current.listRef.current = list;
}

describe("usePointerReorder", () => {
  let onMove: ReturnType<typeof vi.fn<(from: number, to: number) => void>>;

  beforeEach(() => {
    onMove = vi.fn<(from: number, to: number) => void>();
  });

  afterEach(() => {
    document.body.style.cursor = "";
  });

  it("moves the dragged row to the row under the pointer", () => {
    const { result } = renderHook(() => usePointerReorder({ onMove, count: 3 }));
    attachList(result);
    const down = pointerDown();
    act(() => result.current.gripProps(0).onPointerDown(down.event));
    expect(down.preventDefault).toHaveBeenCalled();
    expect(result.current.dragging).toBe(0);
    expect(document.body.style.cursor).toBe("grabbing");

    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 120 }));
    });
    expect(onMove).toHaveBeenCalledWith(0, 2);
    expect(result.current.dragging).toBe(2);

    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"));
    });
    expect(result.current.dragging).toBeNull();
    expect(document.body.style.cursor).toBe("");
  });

  it("does nothing while the pointer stays over the same row", () => {
    const { result } = renderHook(() => usePointerReorder({ onMove, count: 3 }));
    attachList(result);
    act(() => result.current.gripProps(1).onPointerDown(pointerDown().event));
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 70 }));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("ignores other buttons and a disabled list", () => {
    const { result } = renderHook(() => usePointerReorder({ onMove, count: 3 }));
    act(() => result.current.gripProps(0).onPointerDown(pointerDown(2).event));
    expect(result.current.dragging).toBeNull();

    const disabled = renderHook(() => usePointerReorder({ onMove, count: 3, disabled: true }));
    act(() => disabled.result.current.gripProps(0).onPointerDown(pointerDown().event));
    expect(disabled.result.current.dragging).toBeNull();
  });

  it("moves with the arrow keys and stops at the ends", () => {
    const { result } = renderHook(() => usePointerReorder({ onMove, count: 3 }));
    const down = key("ArrowDown");
    result.current.gripProps(1).onKeyDown(down.event);
    expect(onMove).toHaveBeenLastCalledWith(1, 2);
    expect(down.preventDefault).toHaveBeenCalled();

    result.current.gripProps(1).onKeyDown(key("ArrowUp").event);
    expect(onMove).toHaveBeenLastCalledWith(1, 0);

    onMove.mockClear();
    result.current.gripProps(0).onKeyDown(key("ArrowUp").event);
    result.current.gripProps(2).onKeyDown(key("ArrowDown").event);
    result.current.gripProps(1).onKeyDown(key("Enter").event);
    expect(onMove).not.toHaveBeenCalled();
  });
});
