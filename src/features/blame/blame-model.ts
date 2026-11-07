import type { BlameLine } from "@/shared/types/git";

export const BLAME_COLOR_COUNT = 8;

export function groupStarts(lines: readonly BlameLine[]): boolean[] {
  return lines.map((line, index) => index === 0 || lines[index - 1]?.commitIndex !== line.commitIndex);
}

export function colorIndexFor(commitIndex: number): number {
  return commitIndex % BLAME_COLOR_COUNT;
}

export function longestBlameLine(lines: readonly BlameLine[]): number {
  let longest = 0;
  for (const line of lines) {
    longest = Math.max(longest, line.content.length);
  }
  return longest;
}
