import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";
import { TextAreaField, TextField } from "./text-field";

describe("TextField", () => {
  it("connects its label to the control", () => {
    render(<TextField label="Nombre" />);
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
  });

  it("describes the control with the hint", () => {
    render(<TextField label="Nombre" hint="Como aparece en los commits" />);
    const input = screen.getByLabelText("Nombre");
    const hint = screen.getByText("Como aparece en los commits");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("flags the control as invalid and shows the error instead of the hint", () => {
    render(<TextField label="Nombre" hint="Ayuda" error="Es obligatorio" />);
    const input = screen.getByLabelText("Nombre");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText("Es obligatorio").id);
    expect(screen.queryByText("Ayuda")).toBeNull();
  });

  it("gives every field its own id so two fields never share a label", () => {
    render(
      <>
        <TextField label="Uno" />
        <TextAreaField label="Dos" />
      </>,
    );
    expect(screen.getByLabelText("Uno").id).not.toBe(screen.getByLabelText("Dos").id);
  });
});

describe("Checkbox", () => {
  it("has an accessible name from its label", () => {
    render(<Checkbox label="Seleccionar linea" defaultChecked />);
    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Seleccionar linea" });
    expect(box.checked).toBe(true);
  });
});
