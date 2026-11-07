import { describe, expect, it } from "vitest";
import {
  ignorePatternForExtension,
  ignorePatternForFolder,
  ignorePatternForPath,
  isTemplateApplied,
  mergeTemplate,
  templateHeader,
} from "./gitignore-model";
import { IGNORE_TEMPLATES } from "./templates";
import type { IgnoreTemplate } from "./templates";

const sample: IgnoreTemplate = { id: "sample", name: "Sample", lines: ["dist/", "*.log", "dist/", ".env"] };

describe("mergeTemplate", () => {
  it("adds a titled section to an empty file", () => {
    const result = mergeTemplate("", sample);
    expect(result.added).toBe(3);
    expect(result.content).toBe("# Sample\ndist/\n*.log\n.env\n");
  });

  it("separates the new section from existing content", () => {
    const result = mergeTemplate("node_modules/", sample);
    expect(result.content).toBe("node_modules/\n\n# Sample\ndist/\n*.log\n.env\n");
  });

  it("skips lines that are already present, even under other comments", () => {
    const result = mergeTemplate("# mine\n*.log\n  .env  \n", sample);
    expect(result.added).toBe(1);
    expect(result.content).toBe("# mine\n*.log\n  .env  \n\n# Sample\ndist/\n");
  });

  it("changes nothing when every line is already there", () => {
    const content = "dist/\n*.log\n.env\n";
    const result = mergeTemplate(content, sample);
    expect(result.added).toBe(0);
    expect(result.content).toBe(content);
  });

  it("handles windows line endings in the existing text", () => {
    const result = mergeTemplate("dist/\r\n*.log\r\n", sample);
    expect(result.added).toBe(1);
  });
});

describe("isTemplateApplied", () => {
  it("detects the section header", () => {
    const merged = mergeTemplate("", sample).content;
    expect(isTemplateApplied(merged, sample)).toBe(true);
    expect(isTemplateApplied("*.log\n", sample)).toBe(false);
    expect(templateHeader(sample)).toBe("# Sample");
  });
});

describe("ignore patterns", () => {
  it("anchors a path at the repository root", () => {
    expect(ignorePatternForPath("src/app.log")).toBe("/src/app.log");
    expect(ignorePatternForPath("\\src\\app.log")).toBe("/src/app.log");
  });

  it("escapes characters git would read as globs or comments", () => {
    expect(ignorePatternForPath("docs/[draft] v2.txt")).toBe("/docs/\\[draft\\] v2.txt");
    expect(ignorePatternForPath("#notes.txt")).toBe("/#notes.txt");
    expect(ignorePatternForPath("a*b?.txt")).toBe("/a\\*b\\?.txt");
  });

  it("builds an extension pattern only when there is one", () => {
    expect(ignorePatternForExtension("src/app.test.ts")).toBe("*.ts");
    expect(ignorePatternForExtension("Makefile")).toBeNull();
    expect(ignorePatternForExtension(".gitignore")).toBeNull();
    expect(ignorePatternForExtension("archive.")).toBeNull();
  });

  it("builds a folder pattern only for nested files", () => {
    expect(ignorePatternForFolder("build/out/app.js")).toBe("/build/out/");
    expect(ignorePatternForFolder("app.js")).toBeNull();
  });
});

describe("templates", () => {
  it("have unique ids and no empty or duplicate lines", () => {
    const ids = new Set(IGNORE_TEMPLATES.map((template) => template.id));
    expect(ids.size).toBe(IGNORE_TEMPLATES.length);
    for (const template of IGNORE_TEMPLATES) {
      expect(template.lines.length).toBeGreaterThan(0);
      expect(new Set(template.lines).size).toBe(template.lines.length);
      expect(template.lines.every((line) => line.trim() === line && line !== "")).toBe(true);
    }
  });
});
