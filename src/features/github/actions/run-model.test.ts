import { describe, expect, it } from "vitest";
import {
  durationSeconds,
  formatDuration,
  isRunFinished,
  parseLog,
  parseWorkflowInputs,
  runOutcome,
  runTitle,
  shortSha,
} from "./run-model";

describe("runOutcome", () => {
  it("maps completed runs by conclusion", () => {
    expect(runOutcome("completed", "success")).toBe("success");
    expect(runOutcome("completed", "failure")).toBe("failure");
    expect(runOutcome("completed", "timed_out")).toBe("failure");
    expect(runOutcome("completed", "startup_failure")).toBe("failure");
    expect(runOutcome("completed", "cancelled")).toBe("cancelled");
    expect(runOutcome("completed", "action_required")).toBe("cancelled");
    expect(runOutcome("completed", "skipped")).toBe("skipped");
    expect(runOutcome("completed", null)).toBe("skipped");
  });

  it("maps unfinished runs by status", () => {
    expect(runOutcome("in_progress", null)).toBe("running");
    expect(runOutcome("queued", null)).toBe("queued");
    expect(runOutcome("waiting", null)).toBe("queued");
    expect(runOutcome(null, null)).toBe("queued");
  });

  it("knows when a run is finished", () => {
    expect(isRunFinished({ status: "completed" })).toBe(true);
    expect(isRunFinished({ status: "in_progress" })).toBe(false);
    expect(isRunFinished({ status: null })).toBe(false);
  });
});

describe("run labels", () => {
  it("prefers the display title, then the name, then the number", () => {
    expect(runTitle({ displayTitle: " Fix crash ", name: "CI", runNumber: 3 })).toBe("Fix crash");
    expect(runTitle({ displayTitle: null, name: "CI", runNumber: 3 })).toBe("CI");
    expect(runTitle({ displayTitle: "  ", name: null, runNumber: 3 })).toBe("#3");
  });

  it("shortens commit ids", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(shortSha("abc")).toBe("abc");
  });
});

describe("durations", () => {
  it("measures the time between two timestamps", () => {
    expect(durationSeconds("2026-01-01T10:00:00Z", "2026-01-01T10:01:30Z")).toBe(90);
    expect(durationSeconds(null, "2026-01-01T10:01:30Z")).toBeNull();
    expect(durationSeconds("nope", "2026-01-01T10:01:30Z")).toBeNull();
    expect(durationSeconds("2026-01-01T10:05:00Z", "2026-01-01T10:01:30Z")).toBeNull();
  });

  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(12)).toBe("12s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3900)).toBe("1h 5m");
  });
});

describe("parseLog", () => {
  it("strips timestamps and terminal colors", () => {
    const lines = parseLog("2026-01-01T10:00:11.1234567Z \u001b[31mred text\u001b[0m\r\nplain\n");
    expect(lines).toEqual([
      { text: "red text", kind: "plain" },
      { text: "plain", kind: "plain" },
    ]);
  });

  it("classifies workflow markers and hides group ends", () => {
    const lines = parseLog(
      [
        "2026-01-01T10:00:00Z ##[group]Run tests",
        "2026-01-01T10:00:01Z [command]/usr/bin/git status",
        "2026-01-01T10:00:02Z ##[warning]careful",
        "2026-01-01T10:00:03Z ##[error]Process completed with exit code 1.",
        "2026-01-01T10:00:04Z ##[endgroup]",
      ].join("\n"),
    );
    expect(lines).toEqual([
      { text: "Run tests", kind: "group" },
      { text: "/usr/bin/git status", kind: "command" },
      { text: "careful", kind: "warning" },
      { text: "Process completed with exit code 1.", kind: "error" },
    ]);
  });

  it("keeps blank lines inside the log and handles an empty log", () => {
    expect(parseLog("a\n\nb")).toEqual([
      { text: "a", kind: "plain" },
      { text: "", kind: "plain" },
      { text: "b", kind: "plain" },
    ]);
    expect(parseLog("")).toEqual([]);
  });

  it("removes a byte order mark before the first timestamp", () => {
    expect(parseLog("\uFEFF2026-01-01T10:00:00Z start")).toEqual([{ text: "start", kind: "plain" }]);
  });
});

describe("parseWorkflowInputs", () => {
  it("reads key=value lines and keeps equals signs in values", () => {
    const result = parseWorkflowInputs("environment = staging\n\nflags=a=b\nempty=");
    expect(result.values).toEqual({ environment: "staging", flags: "a=b", empty: "" });
    expect(result.invalidLines).toEqual([]);
  });

  it("reports lines without a name", () => {
    const result = parseWorkflowInputs("ok=1\njust text\n=value");
    expect(result.values).toEqual({ ok: "1" });
    expect(result.invalidLines).toEqual([2, 3]);
  });
});
