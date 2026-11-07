import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Borrar rama"
      description="Se borrara la rama."
      confirmLabel="Borrar"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("focuses the safe option first so Enter never confirms by accident", () => {
    setup({ destructive: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  });

  it("calls the right callback for each button", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("lists what will be lost", () => {
    setup({ consequences: ["Se pierden 3 commits", "No se puede deshacer"] });
    expect(screen.getByText("Se pierden 3 commits")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("cannot be cancelled with Escape while the action is running", () => {
    const { onCancel } = setup({ loading: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    const cancel = screen.getByRole<HTMLButtonElement>("button", { name: "Cancelar" });
    expect(cancel.disabled).toBe(true);
  });
});
