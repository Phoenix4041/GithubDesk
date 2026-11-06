import { describe, expect, it } from "vitest";
import { extensionOf, folderNameFromUrl, joinPath, splitPath } from "./paths";

describe("splitPath", () => {
  it("separates directory and file name", () => {
    expect(splitPath("src/app/main.tsx")).toEqual({ directory: "src/app/", fileName: "main.tsx" });
  });

  it("handles root files and backslashes", () => {
    expect(splitPath("README.md")).toEqual({ directory: "", fileName: "README.md" });
    expect(splitPath("src\\lib\\a.ts")).toEqual({ directory: "src/lib/", fileName: "a.ts" });
  });
});

describe("folderNameFromUrl", () => {
  it("extracts the repository name", () => {
    expect(folderNameFromUrl("https://github.com/owner/repo.git")).toBe("repo");
    expect(folderNameFromUrl("git@github.com:owner/repo.git")).toBe("repo");
    expect(folderNameFromUrl("https://github.com/owner/repo/")).toBe("repo");
    expect(folderNameFromUrl("")).toBe("");
  });
});

describe("joinPath", () => {
  it("keeps the separator style of the parent", () => {
    expect(joinPath("C:\\Users\\me", "repo")).toBe("C:\\Users\\me\\repo");
    expect(joinPath("/home/me/", "repo")).toBe("/home/me/repo");
    expect(joinPath("", "repo")).toBe("repo");
  });
});

describe("extensionOf", () => {
  it("returns lowercase extensions", () => {
    expect(extensionOf("src/App.TSX")).toBe("tsx");
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
  });
});
