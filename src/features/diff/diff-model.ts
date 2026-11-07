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

export interface SplitCell {
  lineIndex: number;
  line: DiffLine;
  missingNewline: boolean;
}

export type SplitRow =
  | { kind: "hunk"; hunkIndex: number; header: string; changeCount: number }
  | { kind: "pair"; hunkIndex: number; rowIndex: number; left: SplitCell | null; right: SplitCell | null };

export function buildSplitRows(diff: FileDiff): SplitRow[] {
  const rows: SplitRow[] = [];
  diff.hunks.forEach((hunk, hunkIndex) => {
    rows.push({ kind: "hunk", hunkIndex, header: hunk.header, changeCount: changeLineIndices(hunk).length });
    let removed: SplitCell[] = [];
    let added: SplitCell[] = [];
    let lastCells: SplitCell[] = [];
    let rowIndex = 0;

    const pushPair = (left: SplitCell | null, right: SplitCell | null) => {
      rows.push({ kind: "pair", hunkIndex, rowIndex, left, right });
      rowIndex += 1;
    };

    const flushChanges = () => {
      const count = Math.max(removed.length, added.length);
      for (let index = 0; index < count; index += 1) {
        pushPair(removed[index] ?? null, added[index] ?? null);
      }
      removed = [];
      added = [];
    };

    hunk.lines.forEach((line, lineIndex) => {
      if (line.kind === "noNewline") {
        for (const cell of lastCells) {
          cell.missingNewline = true;
        }
        return;
      }
      if (line.kind === "removed") {
        const cell: SplitCell = { lineIndex, line, missingNewline: false };
        removed.push(cell);
        lastCells = [cell];
        return;
      }
      if (line.kind === "added") {
        const cell: SplitCell = { lineIndex, line, missingNewline: false };
        added.push(cell);
        lastCells = [cell];
        return;
      }
      flushChanges();
      const left: SplitCell = { lineIndex, line, missingNewline: false };
      const right: SplitCell = { lineIndex, line, missingNewline: false };
      pushPair(left, right);
      lastCells = [left, right];
    });
    flushChanges();
  });
  return rows;
}
