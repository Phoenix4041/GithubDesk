import type { DiffLine, FileDiff, Hunk, LineSelection } from "@/shared/types/git";

export type DiffRow =
  | { kind: "hunk"; hunkIndex: number; header: string; changeCount: number }
  | { kind: "line"; hunkIndex: number; lineIndex: number; line: DiffLine };

export function isChangeLine(line: DiffLine): boolean {
  return line.kind === "added" || line.kind === "removed";
}

export function changeLineIndices(hunk: Hunk): number[] {
  const indices: number[] = [];
  hunk.lines.forEach((line, index) => {
    if (isChangeLine(line)) {
      indices.push(index);
    }
  });
  return indices;
}

export function buildDiffRows(diff: FileDiff): DiffRow[] {
  const rows: DiffRow[] = [];
  diff.hunks.forEach((hunk, hunkIndex) => {
    rows.push({ kind: "hunk", hunkIndex, header: hunk.header, changeCount: changeLineIndices(hunk).length });
    hunk.lines.forEach((line, lineIndex) => {
      rows.push({ kind: "line", hunkIndex, lineIndex, line });
    });
  });
  return rows;
}

export function lineKey(hunkIndex: number, lineIndex: number): string {
  return `${hunkIndex}:${lineIndex}`;
}

export function selectionsFromKeys(keys: ReadonlySet<string>): LineSelection[] {
  const grouped = new Map<number, number[]>();
  for (const key of keys) {
    const [hunkPart, linePart] = key.split(":");
    const hunkIndex = Number(hunkPart);
    const lineIndex = Number(linePart);
    if (Number.isNaN(hunkIndex) || Number.isNaN(lineIndex)) {
      continue;
    }
    const existing = grouped.get(hunkIndex) ?? [];
    existing.push(lineIndex);
    grouped.set(hunkIndex, existing);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([hunkIndex, lineIndices]) => ({
      hunkIndex,
      lineIndices: lineIndices.sort((left, right) => left - right),
    }));
}

export function longestLineLength(diff: FileDiff): number {
  let longest = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      longest = Math.max(longest, line.content.length);
    }
  }
  return longest;
}
