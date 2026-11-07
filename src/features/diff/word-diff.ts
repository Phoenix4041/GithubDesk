import type { FileDiff } from "@/shared/types/git";

export interface WordRange {
  start: number;
  end: number;
}

export interface WordDiffResult {
  removed: WordRange[];
  added: WordRange[];
}

export interface StyledSegment {
  text: string;
  className: string | null;
  changed: boolean;
}

interface Token {
  text: string;
  start: number;
}

export const MAX_WORD_DIFF_LINE_LENGTH = 500;
export const MAX_WORD_DIFF_PAIRS = 2000;
const MAX_TOKEN_PRODUCT = 60_000;
const MIN_SHARED_RATIO = 0.3;
const TOKEN_PATTERN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    tokens.push({ text: match[0], start: match.index });
  }
  return tokens;
}

function longestCommonSubsequence(left: Token[], right: Token[]): Array<[number, number]> {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const table = new Uint16Array(rows * columns);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const index = i * columns + j;
      if (left[i]?.text === right[j]?.text) {
        table[index] = (table[(i + 1) * columns + j + 1] ?? 0) + 1;
      } else {
        table[index] = Math.max(table[(i + 1) * columns + j] ?? 0, table[i * columns + j + 1] ?? 0);
      }
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i]?.text === right[j]?.text) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * columns + j] ?? 0) >= (table[i * columns + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function changedRanges(tokens: Token[], matchedIndices: ReadonlySet<number>, source: string): WordRange[] {
  const ranges: WordRange[] = [];
  tokens.forEach((token, index) => {
    if (matchedIndices.has(index)) {
      return;
    }
    const end = token.start + token.text.length;
    const last = ranges[ranges.length - 1];
    if (last && source.slice(last.end, token.start).trim() === "") {
      last.end = end;
    } else {
      ranges.push({ start: token.start, end });
    }
  });
  return ranges;
}

export function diffWords(oldText: string, newText: string): WordDiffResult | null {
  if (oldText === newText) {
    return null;
  }
  if (oldText.length > MAX_WORD_DIFF_LINE_LENGTH || newText.length > MAX_WORD_DIFF_LINE_LENGTH) {
    return null;
  }
  const left = tokenize(oldText);
  const right = tokenize(newText);
  if (left.length === 0 || right.length === 0 || left.length * right.length > MAX_TOKEN_PRODUCT) {
    return null;
  }
  const common = longestCommonSubsequence(left, right);
  const sharedCharacters = common.reduce((total, [index]) => total + (left[index]?.text.trim().length ?? 0), 0);
  const longest = Math.max(oldText.trim().length, newText.trim().length);
  if (longest === 0 || sharedCharacters / longest < MIN_SHARED_RATIO) {
    return null;
  }
  return {
    removed: changedRanges(left, new Set(common.map(([index]) => index)), oldText),
    added: changedRanges(right, new Set(common.map(([, index]) => index)), newText),
  };
}

export function wordKey(hunkIndex: number, lineIndex: number): string {
  return `${hunkIndex}:${lineIndex}`;
}

function stripLineEnding(content: string): string {
  return content.replace(/\r$/, "");
}

export function computeWordRanges(diff: FileDiff): Map<string, WordRange[]> {
  const result = new Map<string, WordRange[]>();
  let pairs = 0;

  diff.hunks.forEach((hunk, hunkIndex) => {
    let removed: number[] = [];
    let added: number[] = [];

    const flush = () => {
      const count = Math.min(removed.length, added.length);
      for (let index = 0; index < count && pairs < MAX_WORD_DIFF_PAIRS; index += 1) {
        const removedIndex = removed[index];
        const addedIndex = added[index];
        const removedLine = removedIndex === undefined ? undefined : hunk.lines[removedIndex];
        const addedLine = addedIndex === undefined ? undefined : hunk.lines[addedIndex];
        if (removedIndex === undefined || addedIndex === undefined || !removedLine || !addedLine) {
          continue;
        }
        pairs += 1;
        const outcome = diffWords(stripLineEnding(removedLine.content), stripLineEnding(addedLine.content));
        if (outcome) {
          result.set(wordKey(hunkIndex, removedIndex), outcome.removed);
          result.set(wordKey(hunkIndex, addedIndex), outcome.added);
        }
      }
      removed = [];
      added = [];
    };

    hunk.lines.forEach((line, lineIndex) => {
      if (line.kind === "removed") {
        if (added.length > 0) {
          flush();
        }
        removed.push(lineIndex);
      } else if (line.kind === "added") {
        added.push(lineIndex);
      } else if (line.kind !== "noNewline") {
        flush();
      }
    });
    flush();
  });

  return result;
}

export function applyWordRanges(
  segments: ReadonlyArray<{ text: string; className: string | null }>,
  ranges: readonly WordRange[] | undefined,
): StyledSegment[] {
  if (!ranges || ranges.length === 0) {
    return segments.map((segment) => ({ ...segment, changed: false }));
  }
  const output: StyledSegment[] = [];
  let offset = 0;
  for (const segment of segments) {
    const segmentEnd = offset + segment.text.length;
    let cursor = offset;
    for (const range of ranges) {
      if (range.end <= cursor || range.start >= segmentEnd) {
        continue;
      }
      const from = Math.max(range.start, cursor);
      const to = Math.min(range.end, segmentEnd);
      if (from > cursor) {
        output.push({ text: segment.text.slice(cursor - offset, from - offset), className: segment.className, changed: false });
      }
      output.push({ text: segment.text.slice(from - offset, to - offset), className: segment.className, changed: true });
      cursor = to;
    }
    if (cursor < segmentEnd) {
      output.push({ text: segment.text.slice(cursor - offset), className: segment.className, changed: false });
    }
    offset = segmentEnd;
  }
  return output.length > 0 ? output : segments.map((segment) => ({ ...segment, changed: false }));
}
