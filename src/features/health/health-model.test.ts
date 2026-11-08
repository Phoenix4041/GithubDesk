import { describe, expect, it } from "vitest";
import { isSafeFolder, parseFolderList, savedBytes } from "./health-model";

describe("parseFolderList", () => {
  it("splits by lines or commas, trims slashes and removes repeats", () => {
    expect(parseFolderList("src\\app/\n docs ,\n\n/src/app\r\nlib")).toEqual(["src/app", "docs", "lib"]);
  });
});

describe("isSafeFolder", () => {
  it("refuses parent folders and absolute paths", () => {
    expect(isSafeFolder("src/app")).toBe(true);
    expect(isSafeFolder("../x")).toBe(false);
    expect(isSafeFolder("a/./b")).toBe(false);
    expect(isSafeFolder("C:/Windows")).toBe(false);
  });
});

describe("savedBytes", () => {
  it("never reports a negative saving", () => {
    expect(savedBytes(100, 40)).toBe(60);
    expect(savedBytes(40, 100)).toBe(0);
  });
});
