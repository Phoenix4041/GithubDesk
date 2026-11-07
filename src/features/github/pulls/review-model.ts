import { commentKey } from "@/features/diff/line-comments";
import type { DiffSide } from "@/features/diff/line-comments";
import type { ReviewComment } from "../types";

export interface ReviewThread {
  id: number;
  path: string;
  side: DiffSide;
  line: number | null;
  comments: ReviewComment[];
}

function sideOf(comment: ReviewComment): DiffSide {
  return comment.side === "LEFT" ? "LEFT" : "RIGHT";
}

export function buildThreads(comments: readonly ReviewComment[]): ReviewThread[] {
  const ordered = [...comments].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id - right.id,
  );
  const threadOf = new Map<number, number>();
  const threads = new Map<number, ReviewThread>();
  for (const comment of ordered) {
    const parent = comment.inReplyToId;
    const threadId = parent === null ? comment.id : (threadOf.get(parent) ?? parent);
    threadOf.set(comment.id, threadId);
    const existing = threads.get(threadId);
    if (existing) {
      existing.comments.push(comment);
    } else {
      threads.set(threadId, {
        id: threadId,
        path: comment.path,
        side: sideOf(comment),
        line: comment.line,
        comments: [comment],
      });
    }
  }
  return [...threads.values()];
}

export function threadsForFile(threads: readonly ReviewThread[], path: string): ReviewThread[] {
  return threads.filter((thread) => thread.path === path);
}

export function outdatedThreads(threads: readonly ReviewThread[]): ReviewThread[] {
  return threads.filter((thread) => thread.line === null);
}

export function threadsAt(threads: readonly ReviewThread[], side: DiffSide, line: number): ReviewThread[] {
  return threads.filter((thread) => thread.line === line && thread.side === side);
}

export function commentCounts(threads: readonly ReviewThread[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    if (thread.line === null) {
      continue;
    }
    const key = commentKey(thread.side, thread.line);
    counts.set(key, (counts.get(key) ?? 0) + thread.comments.length);
  }
  return counts;
}
