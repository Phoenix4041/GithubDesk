import { describe, expect, it } from "vitest";
import { diffSets, filterItems, sameSet, splitReviewerKeys, teamKey } from "./collab-model";

describe("collab model", () => {
  it("tells what was added and what was removed", () => {
    expect(diffSets(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    expect(diffSets([], ["x", "x"])).toEqual({ added: ["x"], removed: [] });
    expect(diffSets(["a", "a"], [])).toEqual({ added: [], removed: ["a"] });
    expect(diffSets(["a"], ["a"])).toEqual({ added: [], removed: [] });
  });

  it("compares sets without caring about the order", () => {
    expect(sameSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSet(["a"], ["a", "b"])).toBe(false);
    expect(sameSet([], [])).toBe(true);
  });

  it("separates users from teams in a reviewer selection", () => {
    expect(splitReviewerKeys(["octo", teamKey("core"), "hubot", teamKey("docs")])).toEqual({
      users: ["octo", "hubot"],
      teams: ["core", "docs"],
    });
    expect(splitReviewerKeys([])).toEqual({ users: [], teams: [] });
  });

  it("filters picker items by label and detail, ignoring case", () => {
    const items = [
      { label: "bug", detail: "Something is broken" },
      { label: "help wanted" },
      { label: "docs", detail: "Documentation" },
    ];
    expect(filterItems(items, "  ").length).toBe(3);
    expect(filterItems(items, "BUG").map((item) => item.label)).toEqual(["bug"]);
    expect(filterItems(items, "document").map((item) => item.label)).toEqual(["docs"]);
    expect(filterItems(items, "zzz")).toEqual([]);
  });
});
