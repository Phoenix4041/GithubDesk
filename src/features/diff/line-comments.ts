import type { DiffLine } from "@/shared/types/git";

export type DiffSide = "LEFT" | "RIGHT";

export interface LineAnchor {
  side: DiffSide;
  line: number;
}

export interface LineCommentControls {
  counts: ReadonlyMap<string, number>;
  onOpen: (side: DiffSide, line: number) => void;
}

export function commentKey(side: DiffSide, line: number): string {
  return `${side}:${line}`;
}

export function lineAnchor(line: DiffLine): LineAnchor | null {
  if (line.kind === "noNewline") {
    return null;
  }
  if (line.kind === "removed") {
    return line.oldNumber === null ? null : { side: "LEFT", line: line.oldNumber };
  }
  return line.newNumber === null ? null : { side: "RIGHT", line: line.newNumber };
}
