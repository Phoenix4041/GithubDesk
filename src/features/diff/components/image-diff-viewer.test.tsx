import { fireEvent, render, screen } from "@testing-library/react";
import type { ParseKeys } from "i18next";
import { describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { ImageDiffViewer } from "./image-diff-viewer";

const t = (key: ParseKeys) => i18next.t(key);
const BEFORE = { url: "data:image/png;base64,AAA", size: 2048, note: null };
const AFTER = { url: "data:image/png;base64,BBB", size: 100, note: null };

function afterImage(): HTMLImageElement {
  const images = screen.getAllByRole<HTMLImageElement>("img", { name: t("imageDiff.after") });
  const image = images[images.length - 1];
  if (!image) {
    throw new Error("missing image");
  }
  return image;
}

describe("ImageDiffViewer", () => {
  it("starts side by side with both versions and their sizes", () => {
    render(<ImageDiffViewer before={BEFORE} after={AFTER} />);
    expect(screen.getByRole("tab", { name: t("imageDiff.modes.side") }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("img", { name: t("imageDiff.before") }).getAttribute("src")).toBe(BEFORE.url);
    expect(afterImage().getAttribute("src")).toBe(AFTER.url);
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("swipes the new version over the old one with the slider", () => {
    render(<ImageDiffViewer before={BEFORE} after={AFTER} />);
    fireEvent.click(screen.getByRole("tab", { name: t("imageDiff.modes.swipe") }));
    expect(screen.getByRole("tab", { name: t("imageDiff.modes.swipe") }).getAttribute("aria-selected")).toBe("true");
    expect(afterImage().style.clipPath).toBe("inset(0 0 0 50%)");
    fireEvent.change(screen.getByRole("slider", { name: t("imageDiff.swipeLabel") }), { target: { value: "20" } });
    expect(afterImage().style.clipPath).toBe("inset(0 0 0 20%)");
  });

  it("fades the new version in onion skin mode", () => {
    render(<ImageDiffViewer before={BEFORE} after={AFTER} />);
    fireEvent.click(screen.getByRole("tab", { name: t("imageDiff.modes.onion") }));
    expect(afterImage().style.opacity).toBe("0.5");
    fireEvent.change(screen.getByRole("slider", { name: t("imageDiff.opacityLabel") }), { target: { value: "80" } });
    expect(afterImage().style.opacity).toBe("0.8");
  });

  it("only offers side by side when one version is missing", () => {
    render(<ImageDiffViewer before={{ url: null, size: null, note: t("imageDiff.missing") }} after={AFTER} />);
    expect(screen.getByText(t("imageDiff.missing"))).toBeTruthy();
    const swipe = screen.getByRole<HTMLButtonElement>("tab", { name: t("imageDiff.modes.swipe") });
    expect(swipe.disabled).toBe(true);
  });
});
