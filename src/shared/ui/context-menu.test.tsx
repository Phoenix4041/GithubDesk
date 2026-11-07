import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenuHost, openContextMenu } from "./context-menu";
import type { ContextMenuEntry } from "./context-menu";

function openWith(entries: ContextMenuEntry[]) {
  act(() => {
    openContextMenu(
      { clientX: 20, clientY: 30, preventDefault: () => undefined, stopPropagation: () => undefined } as ReactMouseEvent,
      entries,
    );
  });
}

describe("ContextMenuHost", () => {
  afterEach(() => {
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("shows the entries as menu items and focuses the first enabled one", () => {
    render(<ContextMenuHost />);
    openWith([
      { label: "Copiar", onSelect: () => undefined },
      { label: "Pegar", onSelect: () => undefined },
    ]);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Copiar" }));
  });

  it("moves with the arrow keys, wrapping around and skipping disabled items", () => {
    render(<ContextMenuHost />);
    openWith([
      { label: "Uno", onSelect: () => undefined },
      { label: "Dos", disabled: true, onSelect: () => undefined },
      { label: "Tres", onSelect: () => undefined },
    ]);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Tres" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Uno" }));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Tres" }));
  });

  it("runs the selected action and closes", () => {
    const onSelect = vi.fn();
    render(<ContextMenuHost />);
    openWith([{ label: "Borrar", destructive: true, onSelect }]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes with Escape and with a press outside of it", () => {
    render(<ContextMenuHost />);
    openWith([{ label: "Uno", onSelect: () => undefined }]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    openWith([{ label: "Uno", onSelect: () => undefined }]);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not open when every entry has an empty label", () => {
    render(<ContextMenuHost />);
    openWith([{ label: "", onSelect: () => undefined }]);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
