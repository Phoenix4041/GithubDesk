import { describe, expect, it } from "vitest";
import { buildCalendar, dayKey, folderLabel } from "./stats-model";

describe("buildCalendar", () => {
  const today = new Date(2026, 10, 8);

  it("covers the last year in weeks that start on Sunday", () => {
    const calendar = buildCalendar([], today);
    const firstWeek = calendar.weeks[0] ?? [];
    const lastWeek = calendar.weeks[calendar.weeks.length - 1] ?? [];
    expect(new Date(`${firstWeek[0]?.date ?? ""}T00:00:00`).getDay()).toBe(0);
    expect(lastWeek[lastWeek.length - 1]?.date).toBe("2026-11-08");
    const inRange = calendar.weeks.flat().filter((day) => day.inRange);
    expect(inRange).toHaveLength(365);
    expect(calendar.total).toBe(0);
    expect(calendar.busiest).toBeNull();
  });

  it("scales the color level by the busiest day and ignores days outside the window", () => {
    const calendar = buildCalendar(
      [
        { date: "2024-01-01", commits: 99 },
        { date: "2026-11-01", commits: 8 },
        { date: "2026-11-02", commits: 1 },
        { date: "2026-11-03", commits: 5 },
      ],
      today,
    );
    const days = new Map(calendar.weeks.flat().map((day) => [day.date, day]));
    expect(days.get("2026-11-01")?.level).toBe(4);
    expect(days.get("2026-11-02")?.level).toBe(1);
    expect(days.get("2026-11-03")?.level).toBe(3);
    expect(days.get("2026-11-04")?.level).toBe(0);
    expect(calendar.total).toBe(14);
    expect(calendar.busiest).toEqual({ date: "2026-11-01", commits: 8 });
  });
});

describe("helpers", () => {
  it("formats local day keys with padding", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("shows the root folder as a slash", () => {
    expect(folderLabel("")).toBe("/");
    expect(folderLabel("src/app")).toBe("src/app");
  });
});
