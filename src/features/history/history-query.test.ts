import { describe, expect, it } from "vitest";
import { buildHistoryQuery, EMPTY_FILTER_FIELDS, hasContentSearch, isFiltering } from "./history-query";

describe("buildHistoryQuery", () => {
  it("is a plain current-branch query without filters", () => {
    const query = buildHistoryQuery(EMPTY_FILTER_FIELDS, false);
    expect(query).toMatchObject({ scope: "current", topoOrder: false, text: null, path: null, follow: false });
  });

  it("uses every branch in topological order when drawing the graph", () => {
    const query = buildHistoryQuery(EMPTY_FILTER_FIELDS, true);
    expect(query).toMatchObject({ scope: "all", topoOrder: true });
  });

  it("falls back to a plain list while a filter is active", () => {
    const query = buildHistoryQuery({ ...EMPTY_FILTER_FIELDS, text: " bug " }, true);
    expect(query).toMatchObject({ scope: "current", topoOrder: false, text: "bug" });
  });

  it("only follows renames when there is a path", () => {
    expect(buildHistoryQuery({ ...EMPTY_FILTER_FIELDS, follow: true }, false).follow).toBe(false);
    const withPath = buildHistoryQuery({ ...EMPTY_FILTER_FIELDS, follow: true, path: "src/a.ts" }, false);
    expect(withPath).toMatchObject({ follow: true, path: "src/a.ts" });
  });

  it("maps the regex switch to the content mode", () => {
    const query = buildHistoryQuery({ ...EMPTY_FILTER_FIELDS, content: "a+", contentRegex: true }, false);
    expect(query.contentMode).toBe("regex");
    expect(hasContentSearch(query)).toBe(true);
    expect(hasContentSearch(buildHistoryQuery(EMPTY_FILTER_FIELDS, false))).toBe(false);
  });

  it("keeps the chosen scope for list searches", () => {
    const query = buildHistoryQuery({ ...EMPTY_FILTER_FIELDS, author: "ada", scope: "all" }, false);
    expect(query.scope).toBe("all");
  });
});

describe("isFiltering", () => {
  it("ignores blank values and the scope switch", () => {
    expect(isFiltering({ ...EMPTY_FILTER_FIELDS, text: "   ", scope: "all" })).toBe(false);
  });

  it("detects any filled filter", () => {
    expect(isFiltering({ ...EMPTY_FILTER_FIELDS, until: "2026-01-01" })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER_FIELDS, path: "a" })).toBe(true);
  });
});
