import { describe, expect, it } from "vitest";
import {
  dueDateToIso,
  formatBytes,
  isoToDueDate,
  normalizeColor,
  previousTagOf,
  releaseStatus,
  releaseTitle,
  tagProblem,
} from "./releases-model";

describe("releases model", () => {
  it("tells drafts and pre-releases from published releases", () => {
    expect(releaseStatus({ draft: true, prerelease: true })).toBe("draft");
    expect(releaseStatus({ draft: false, prerelease: true })).toBe("prerelease");
    expect(releaseStatus({ draft: false, prerelease: false })).toBe("published");
  });

  it("falls back to the tag when a release has no title", () => {
    expect(releaseTitle({ name: "One", tagName: "v1" })).toBe("One");
    expect(releaseTitle({ name: "  ", tagName: "v1" })).toBe("v1");
    expect(releaseTitle({ name: null, tagName: "v1" })).toBe("v1");
  });

  it("refuses tags git would not accept", () => {
    expect(tagProblem("v1.0.0")).toBeNull();
    expect(tagProblem("release/2026-01")).toBeNull();
    expect(tagProblem("")).toBe("empty");
    for (const bad of ["a b", "a..b", "-x", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a\\b"]) {
      expect(tagProblem(bad)).toBe("invalid");
    }
  });

  it("writes sizes the way people read them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3 GB");
  });

  it("finds the tag before the chosen one in a newest-first list", () => {
    const tags = ["v1.2.0", "v1.1.0", "v1.0.0"];
    expect(previousTagOf(tags, "v1.1.0")).toBe("v1.0.0");
    expect(previousTagOf(tags, "v1.0.0")).toBeNull();
    expect(previousTagOf(tags, "v1.3.0")).toBe("v1.2.0");
    expect(previousTagOf([], "v1")).toBeNull();
  });

  it("cleans label colors and converts due dates", () => {
    expect(normalizeColor("#D73A4A")).toBe("d73a4a");
    expect(normalizeColor("fff")).toBeNull();
    expect(dueDateToIso("2026-12-31")).toBe("2026-12-31T00:00:00Z");
    expect(dueDateToIso("31/12/2026")).toBeNull();
    expect(isoToDueDate("2026-12-31T00:00:00Z")).toBe("2026-12-31");
    expect(isoToDueDate(null)).toBe("");
  });
});
