import { describe, expect, it } from "vitest";
import { isAllowedImageSource } from "./markdown-safety";

describe("isAllowedImageSource", () => {
  it("accepts images served by GitHub", () => {
    expect(isAllowedImageSource("https://github.com/user-attachments/assets/abc")).toBe(true);
    expect(isAllowedImageSource("https://avatars.githubusercontent.com/u/1")).toBe(true);
    expect(isAllowedImageSource("https://user-images.githubusercontent.com/1/pic.png")).toBe(true);
  });

  it("rejects other hosts, plain http, data urls and look-alikes", () => {
    expect(isAllowedImageSource("https://tracker.example.com/pixel.gif")).toBe(false);
    expect(isAllowedImageSource("http://github.com/x.png")).toBe(false);
    expect(isAllowedImageSource("data:image/png;base64,AAAA")).toBe(false);
    expect(isAllowedImageSource("https://github.com.evil.example/x.png")).toBe(false);
    expect(isAllowedImageSource("https://evilgithubusercontent.com/x.png")).toBe(false);
    expect(isAllowedImageSource("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageSource(undefined)).toBe(false);
    expect(isAllowedImageSource("")).toBe(false);
  });
});
