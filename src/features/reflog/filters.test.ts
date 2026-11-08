import { describe, expect, it } from "vitest";
import type { ReflogEntry } from "@/shared/types/git";
import { filterByDate } from "./filters";

function entryAt(index: number, iso: string): ReflogEntry {
  return {
    index,
    hash: `${index}`.repeat(40),
    shortHash: `${index}`.repeat(7),
    time: new Date(iso).getTime() / 1000,
    action: "commit",
    message: `entry ${index}`,
  };
}

const ENTRIES = [
  entryAt(0, "2026-05-10T12:00:00"),
  entryAt(1, "2026-05-05T12:00:00"),
  entryAt(2, "2026-05-01T12:00:00"),
];

describe("filterByDate", () => {
  it("keeps everything without limits", () => {
    expect(filterByDate(ENTRIES, "", "")).toHaveLength(3);
  });

  it("applies the lower and upper days inclusively", () => {
    expect(filterByDate(ENTRIES, "2026-05-05", "").map((entry) => entry.index)).toEqual([0, 1]);
    expect(filterByDate(ENTRIES, "", "2026-05-05").map((entry) => entry.index)).toEqual([1, 2]);
    expect(filterByDate(ENTRIES, "2026-05-05", "2026-05-05").map((entry) => entry.index)).toEqual([1]);
  });
});
