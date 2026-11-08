import { describe, expect, it } from "vitest";
import { applyCustomTheme, applyDensity } from "./use-theme";

describe("applying the look", () => {
  it("sets and clears the variables of a custom theme", () => {
    const root = document.createElement("div");
    applyCustomTheme(root, { id: "a", name: "A", base: "dark", colors: { fg: "#ffffff", canvas: "#000000" } });
    expect(root.style.getPropertyValue("--fg")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--canvas")).toBe("#000000");
    applyCustomTheme(root, null);
    expect(root.style.getPropertyValue("--fg")).toBe("");
  });

  it("keeps a single density class", () => {
    const root = document.createElement("div");
    applyDensity(root, "compact");
    applyDensity(root, "comfortable");
    expect([...root.classList]).toEqual(["density-comfortable"]);
    applyDensity(root, "normal");
    expect(root.classList.length).toBe(0);
  });
});
