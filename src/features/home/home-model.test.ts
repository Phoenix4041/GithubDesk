import { describe, expect, it } from "vitest";
import { buildRecentRows, dayPeriod, displayName, recentPaths, repoStatusKind } from "./home-model";
import type { RepoState } from "./home-model";

function state(overrides: Partial<RepoState> = {}): RepoState {
  return { path: "/a", available: true, branch: "main", dirty: false, ahead: 0, behind: 0, ...overrides };
}

describe("dayPeriod", () => {
  it("splits the day into four periods", () => {
    expect(dayPeriod(7)).toBe("morning");
    expect(dayPeriod(12)).toBe("afternoon");
    expect(dayPeriod(18)).toBe("afternoon");
    expect(dayPeriod(21)).toBe("evening");
    expect(dayPeriod(2)).toBe("night");
    expect(dayPeriod(5)).toBe("night");
  });
});

describe("displayName", () => {
  it("uses the first name and falls back to the login", () => {
    expect(displayName({ name: "Ana Maria Lopez", login: "ana" })).toBe("Ana");
    expect(displayName({ name: "  ", login: "ana" })).toBe("ana");
    expect(displayName({ name: null, login: "ana" })).toBe("ana");
    expect(displayName(null)).toBe("");
  });
});

describe("repoStatusKind", () => {
  it("prioritizes missing, then local changes, then sync state", () => {
    expect(repoStatusKind(undefined)).toBe("missing");
    expect(repoStatusKind(state({ available: false }))).toBe("missing");
    expect(repoStatusKind(state({ dirty: true, ahead: 2 }))).toBe("dirty");
    expect(repoStatusKind(state({ ahead: 1, behind: 1 }))).toBe("diverged");
    expect(repoStatusKind(state({ ahead: 1 }))).toBe("ahead");
    expect(repoStatusKind(state({ behind: 3 }))).toBe("behind");
    expect(repoStatusKind(state())).toBe("clean");
  });
});

describe("recent repositories", () => {
  const recents = [
    { path: "/old", name: "old", lastOpened: 1 },
    { path: "/new", name: "new", lastOpened: 9 },
    { path: "/mid", name: "mid", lastOpened: 5 },
  ];

  it("orders by last opened and respects the limit", () => {
    expect(recentPaths(recents, 2)).toEqual(["/new", "/mid"]);
  });

  it("joins repository states by path", () => {
    const rows = buildRecentRows(recents, [state({ path: "/new", branch: "dev", ahead: 2 })], 2);
    expect(rows.map((row) => row.name)).toEqual(["new", "mid"]);
    expect(rows[0]).toMatchObject({ branch: "dev", status: "ahead", ahead: 2 });
    expect(rows[1]?.status).toBe("missing");
  });

  it("does not claim a status while states are still loading", () => {
    expect(buildRecentRows(recents, undefined, 1)[0]?.status).toBe("clean");
  });
});
