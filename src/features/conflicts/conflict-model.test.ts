import { describe, expect, it } from "vitest";
import { countConflicts, parseConflictRegions, resolveAllRegions, resolveRegion } from "./conflict-model";

const SINGLE = ["before", "<<<<<<< HEAD", "mine", "=======", "yours", ">>>>>>> feature", "after", ""].join("\n");

describe("parseConflictRegions", () => {
  it("finds one region with both sides and their labels", () => {
    const regions = parseConflictRegions(SINGLE);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      index: 0,
      startLine: 1,
      endLine: 5,
      ours: ["mine"],
      theirs: ["yours"],
      base: null,
      oursLabel: "HEAD",
      theirsLabel: "feature",
    });
  });

  it("reads the base section of diff3 style conflicts", () => {
    const text = ["<<<<<<< HEAD", "mine", "||||||| merged common ancestors", "original", "=======", "yours", ">>>>>>> topic"].join(
      "\n",
    );
    const [region] = parseConflictRegions(text);
    expect(region?.base).toEqual(["original"]);
    expect(region?.ours).toEqual(["mine"]);
    expect(region?.theirs).toEqual(["yours"]);
  });

  it("finds several regions in order", () => {
    const text = [SINGLE, "<<<<<<< HEAD", "a", "=======", "b", ">>>>>>> feature"].join("\n");
    const regions = parseConflictRegions(text);
    expect(regions.map((region) => region.index)).toEqual([0, 1]);
    expect(regions[1]?.ours).toEqual(["a"]);
  });

  it("supports empty sides", () => {
    const text = ["<<<<<<< HEAD", "=======", "added by them", ">>>>>>> feature"].join("\n");
    const [region] = parseConflictRegions(text);
    expect(region?.ours).toEqual([]);
    expect(region?.theirs).toEqual(["added by them"]);
  });

  it("tolerates carriage returns at the end of marker lines", () => {
    const text = ["<<<<<<< HEAD\r", "mine\r", "=======\r", "yours\r", ">>>>>>> feature\r"].join("\n");
    const [region] = parseConflictRegions(text);
    expect(region?.ours).toEqual(["mine\r"]);
    expect(region?.theirs).toEqual(["yours\r"]);
  });

  it("ignores an unterminated block", () => {
    const text = ["<<<<<<< HEAD", "mine", "=======", "yours"].join("\n");
    expect(parseConflictRegions(text)).toEqual([]);
  });

  it("restarts at a nested start marker", () => {
    const text = ["<<<<<<< lost", "x", "<<<<<<< HEAD", "mine", "=======", "yours", ">>>>>>> feature"].join("\n");
    const regions = parseConflictRegions(text);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.startLine).toBe(2);
  });

  it("does not treat lookalike lines inside code as markers", () => {
    const text = ['const divider = "=======";', "  <<<<<<< indented", "======= trailing text", "plain"].join("\n");
    expect(parseConflictRegions(text)).toEqual([]);
  });

  it("returns nothing for clean text", () => {
    expect(parseConflictRegions("just\ntext\n")).toEqual([]);
    expect(countConflicts("just\ntext\n")).toBe(0);
  });
});

describe("resolveRegion", () => {
  it("keeps only our side", () => {
    expect(resolveRegion(SINGLE, 0, "ours")).toBe("before\nmine\nafter\n");
  });

  it("keeps only their side", () => {
    expect(resolveRegion(SINGLE, 0, "theirs")).toBe("before\nyours\nafter\n");
  });

  it("keeps both sides in either order", () => {
    expect(resolveRegion(SINGLE, 0, "both")).toBe("before\nmine\nyours\nafter\n");
    expect(resolveRegion(SINGLE, 0, "theirsFirst")).toBe("before\nyours\nmine\nafter\n");
  });

  it("resolves only the chosen region", () => {
    const text = [SINGLE, "<<<<<<< HEAD", "a", "=======", "b", ">>>>>>> feature"].join("\n");
    const result = resolveRegion(text, 1, "theirs");
    expect(countConflicts(result)).toBe(1);
    expect(result.endsWith("b")).toBe(true);
  });

  it("leaves the text alone for an unknown region", () => {
    expect(resolveRegion(SINGLE, 4, "ours")).toBe(SINGLE);
  });
});

describe("resolveAllRegions", () => {
  it("resolves every region with the same choice", () => {
    const text = [SINGLE, "<<<<<<< HEAD", "a", "=======", "b", ">>>>>>> feature", ""].join("\n");
    const result = resolveAllRegions(text, "ours");
    expect(countConflicts(result)).toBe(0);
    expect(result).toBe("before\nmine\nafter\n\na\n");
  });

  it("returns clean text unchanged", () => {
    expect(resolveAllRegions("clean\n", "theirs")).toBe("clean\n");
  });
});
