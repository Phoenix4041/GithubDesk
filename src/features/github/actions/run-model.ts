import type { WorkflowRun } from "../types";

export type RunOutcome = "success" | "failure" | "cancelled" | "running" | "queued" | "skipped";

export function runOutcome(status: string | null, conclusion: string | null): RunOutcome {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "success";
      case "failure":
      case "timed_out":
      case "startup_failure":
        return "failure";
      case "cancelled":
      case "action_required":
        return "cancelled";
      default:
        return "skipped";
    }
  }
  if (status === "in_progress") {
    return "running";
  }
  return "queued";
}

export function isRunFinished(run: Pick<WorkflowRun, "status">): boolean {
  return run.status === "completed";
}

export function runTitle(run: Pick<WorkflowRun, "displayTitle" | "name" | "runNumber">): string {
  return run.displayTitle?.trim() || run.name?.trim() || `#${run.runNumber}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function durationSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) {
    return null;
  }
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
    return null;
  }
  return Math.round((to - from) / 1000);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "-";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  const hours = Math.floor(minutes / 60);
  const minutesLeft = minutes % 60;
  return minutesLeft === 0 ? `${hours}h` : `${hours}h ${minutesLeft}m`;
}

export type LogLineKind = "plain" | "error" | "warning" | "group" | "command";

export interface LogLine {
  text: string;
  kind: LogLineKind;
}

const ANSI_PATTERN = new RegExp(String.raw`\u001b\[[0-9;?]*[ -/]*[@-~]`, "g");
const TIMESTAMP_PATTERN = /^\uFEFF?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

function classify(text: string): LogLine | null {
  if (text.startsWith("##[group]")) {
    return { text: text.slice("##[group]".length), kind: "group" };
  }
  if (text.startsWith("##[endgroup]")) {
    return null;
  }
  if (text.startsWith("##[error]")) {
    return { text: text.slice("##[error]".length), kind: "error" };
  }
  if (text.startsWith("##[warning]")) {
    return { text: text.slice("##[warning]".length), kind: "warning" };
  }
  if (text.startsWith("[command]")) {
    return { text: text.slice("[command]".length), kind: "command" };
  }
  return { text, kind: "plain" };
}

export function parseLog(raw: string): LogLine[] {
  const lines: LogLine[] = [];
  const parts = raw.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  for (const part of parts) {
    const cleaned = part.replace(ANSI_PATTERN, "").replace(TIMESTAMP_PATTERN, "");
    const line = classify(cleaned);
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

export interface WorkflowInputs {
  values: Record<string, string>;
  invalidLines: number[];
}

export function parseWorkflowInputs(text: string): WorkflowInputs {
  const values: Record<string, string> = {};
  const invalidLines: number[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") {
      return;
    }
    const separator = line.indexOf("=");
    const key = separator === -1 ? "" : line.slice(0, separator).trim();
    if (key === "") {
      invalidLines.push(index + 1);
      return;
    }
    values[key] = line.slice(separator + 1).trim();
  });
  return { values, invalidLines };
}
