import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

function Harness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        abrir
      </button>
      <Dialog
        open={open}
        title="Titulo"
        description="Descripcion"
        onClose={() => setOpen(false)}
        dismissible={dismissible}
        footer={<button type="button">aceptar</button>}
      >
        <input aria-label="campo" data-autofocus />
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("is labelled by its title and described by its description", () => {
    render(
      <Dialog open title="Titulo" description="Descripcion" onClose={() => undefined}>
        <p>contenido</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Titulo" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Descripcion")).toBeTruthy();
  });

  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} title="Titulo" onClose={() => undefined}>
        <p>contenido</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves focus to the autofocus field and gives it back to the opener when closed", () => {
    render(<Harness />);
    const opener = screen.getByText("abrir");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText("campo"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes with Escape and with a click on the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open title="Titulo" onClose={onClose}>
        <p>contenido</p>
      </Dialog>,
    );
    expect(container).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).not.toBeNull();
    if (backdrop) {
      fireEvent.mouseDown(backdrop);
    }
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ignores Escape and hides the close button when it cannot be dismissed", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Titulo" onClose={onClose} dismissible={false}>
        <p>contenido</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
  });

  it("keeps Tab inside the dialog by wrapping from the last control to the first", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("abrir"));
    const last = screen.getByText("aceptar");
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
