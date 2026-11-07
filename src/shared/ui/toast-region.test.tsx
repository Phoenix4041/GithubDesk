import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastRegion } from "./toast-region";
import { useToastStore } from "./toast-store";

function push(input: Parameters<ReturnType<typeof useToastStore.getState>["push"]>[0]) {
  act(() => {
    useToastStore.getState().push(input);
  });
}

describe("ToastRegion", () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => useToastStore.setState({ toasts: [] }));
  });

  it("is a polite live region so screen readers announce new messages", () => {
    const { container } = render(<ToastRegion />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("marks errors as alerts and everything else as status", () => {
    render(<ToastRegion />);
    push({ kind: "error", title: "Fallo" });
    push({ kind: "success", title: "Listo" });
    expect(screen.getByRole("alert").textContent).toContain("Fallo");
    expect(screen.getByRole("status").textContent).toContain("Listo");
  });

  it("dismisses a message with its close button", () => {
    render(<ToastRegion />);
    push({ kind: "info", title: "Aviso" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("Aviso")).toBeNull();
  });

  it("runs an action and removes the message", () => {
    const run = vi.fn();
    render(<ToastRegion />);
    push({ kind: "info", title: "Aviso", actions: [{ label: "Deshacer", run }] });
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Aviso")).toBeNull();
  });

  it("removes messages by themselves, errors lasting longer than successes", () => {
    vi.useFakeTimers();
    render(<ToastRegion />);
    push({ kind: "success", title: "Listo" });
    push({ kind: "error", title: "Fallo" });
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText("Listo")).toBeNull();
    expect(screen.getByText("Fallo")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Fallo")).toBeNull();
  });

  it("keeps only the latest four messages on screen", () => {
    render(<ToastRegion />);
    for (let index = 1; index <= 6; index += 1) {
      push({ kind: "info", title: `Mensaje ${index}` });
    }
    expect(screen.queryByText("Mensaje 2")).toBeNull();
    expect(screen.getByText("Mensaje 3")).toBeTruthy();
    expect(screen.getByText("Mensaje 6")).toBeTruthy();
  });
});
