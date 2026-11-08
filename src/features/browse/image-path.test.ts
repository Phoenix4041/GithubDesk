import { describe, expect, it } from "vitest";
import { imageDataUrl, imageMimeType, isImagePath } from "./image-path";

describe("isImagePath", () => {
  it("recognises the supported image extensions in any case", () => {
    for (const path of ["a.png", "b.JPG", "dir/c.jpeg", "d.gif", "e.webp", "icons/f.svg"]) {
      expect(isImagePath(path)).toBe(true);
    }
  });

  it("ignores other files and names without an extension", () => {
    expect(isImagePath("notes.txt")).toBe(false);
    expect(isImagePath("png")).toBe(false);
    expect(isImagePath(".png")).toBe(false);
    expect(isImagePath("folder.png/readme")).toBe(false);
  });

  it("builds data urls with the right type", () => {
    expect(imageMimeType("logo.svg")).toBe("image/svg+xml");
    expect(imageDataUrl("a.jpg", "AAA")).toBe("data:image/jpeg;base64,AAA");
    expect(imageDataUrl("a.txt", "AAA")).toBeNull();
  });
});
