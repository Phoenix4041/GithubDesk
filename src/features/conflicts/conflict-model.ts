export interface ConflictRegion {
  index: number;
  startLine: number;
  endLine: number;
  ours: string[];
  base: string[] | null;
  theirs: string[];
  oursLabel: string;
  theirsLabel: string;
}

export type ConflictChoice = "ours" | "theirs" | "both" | "theirsFirst";

const START_MARKER = /^<{7}(?: (.*))?$/;
const BASE_MARKER = /^\|{7}(?: (.*))?$/;
const MIDDLE_MARKER = /^={7}$/;
const END_MARKER = /^>{7}(?: (.*))?$/;

function withoutCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

export function parseConflictRegions(text: string): ConflictRegion[] {
  const lines = text.split("\n");
  const regions: ConflictRegion[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const start = START_MARKER.exec(withoutCarriageReturn(lines[cursor] ?? ""));
    if (!start) {
      cursor += 1;
      continue;
    }

    const ours: string[] = [];
    const base: string[] = [];
    const theirs: string[] = [];
    let section: "ours" | "base" | "theirs" = "ours";
    let hasBase = false;
    let theirsLabel = "";
    let closed = false;
    let scan = cursor + 1;

    for (; scan < lines.length; scan += 1) {
      const line = lines[scan] ?? "";
      const clean = withoutCarriageReturn(line);
      if (START_MARKER.test(clean)) {
        break;
      }
      if (section === "ours" && BASE_MARKER.test(clean)) {
        section = "base";
        hasBase = true;
        continue;
      }
      if (section !== "theirs" && MIDDLE_MARKER.test(clean)) {
        section = "theirs";
        continue;
      }
      if (section === "theirs") {
        const end = END_MARKER.exec(clean);
        if (end) {
          theirsLabel = end[1] ?? "";
          closed = true;
          break;
        }
      }
      if (section === "ours") {
        ours.push(line);
      } else if (section === "base") {
        base.push(line);
      } else {
        theirs.push(line);
      }
    }

    if (closed) {
      regions.push({
        index: regions.length,
        startLine: cursor,
        endLine: scan,
        ours,
        base: hasBase ? base : null,
        theirs,
        oursLabel: start[1] ?? "",
        theirsLabel,
      });
      cursor = scan + 1;
    } else {
      cursor = scan;
    }
  }
  return regions;
}

export function countConflicts(text: string): number {
  return parseConflictRegions(text).length;
}

function replacementFor(region: ConflictRegion, choice: ConflictChoice): string[] {
  switch (choice) {
    case "ours":
      return region.ours;
    case "theirs":
      return region.theirs;
    case "both":
      return [...region.ours, ...region.theirs];
    case "theirsFirst":
      return [...region.theirs, ...region.ours];
  }
}

export function resolveRegion(text: string, index: number, choice: ConflictChoice): string {
  const region = parseConflictRegions(text)[index];
  if (!region) {
    return text;
  }
  const lines = text.split("\n");
  lines.splice(region.startLine, region.endLine - region.startLine + 1, ...replacementFor(region, choice));
  return lines.join("\n");
}

export function resolveAllRegions(text: string, choice: ConflictChoice): string {
  const regions = parseConflictRegions(text);
  if (regions.length === 0) {
    return text;
  }
  const lines = text.split("\n");
  for (const region of [...regions].reverse()) {
    lines.splice(region.startLine, region.endLine - region.startLine + 1, ...replacementFor(region, choice));
  }
  return lines.join("\n");
}
