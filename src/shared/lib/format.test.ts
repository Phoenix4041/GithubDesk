import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./format";

const NOW = 1_700_000_000_000;

describe("formatRelativeTime", () => {
  it("formats recent times in the requested language", () => {
    expect(formatRelativeTime(1_700_000_000 - 5 * 60, "es", NOW)).toBe("hace 5 minutos");
    expect(formatRelativeTime(1_700_000_000 - 3 * 3600, "en", NOW)).toBe("3 hours ago");
  });

  it("uses natural words for yesterday", () => {
    expect(formatRelativeTime(1_700_000_000 - 86_400, "es", NOW)).toBe("ayer");
  });

  it("formats long periods in years", () => {
    expect(formatRelativeTime(1_700_000_000 - 3 * 365 * 86_400, "en", NOW)).toBe("3 years ago");
  });
});
