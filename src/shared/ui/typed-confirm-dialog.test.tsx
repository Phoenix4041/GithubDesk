import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { TypedConfirmDialog } from "./typed-confirm-dialog";

function setup(overrides: Partial<Parameters<typeof TypedConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <TypedConfirmDialog
      open
      title="Delete it"
      description="This is permanent."
      consequences={["Everything is lost"]}
      expected="acme/app"
      confirmLabel="Delete forever"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

const field = () => screen.getByLabelText(i18next.t("confirm.typeToConfirm", { value: "acme/app" }));

describe("TypedConfirmDialog", () => {
  it("keeps the confirm button off until the exact text is typed", () => {
    const { onConfirm } = setup();
    const confirm = screen.getByRole<HTMLButtonElement>("button", { name: "Delete forever" });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "ACME/app" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "acme/app " } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "acme/app" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("acme/app");
  });

  it("shows the consequences and cancels without confirming", () => {
    const { onConfirm, onCancel } = setup();
    expect(screen.getByText("Everything is lost")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: i18next.t("common.cancel") }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not submit with Enter before the text matches", () => {
    const { onConfirm } = setup();
    fireEvent.submit(field().closest("form") as HTMLFormElement);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "acme/app" } });
    fireEvent.submit(field().closest("form") as HTMLFormElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
