import { scoreItem } from "./command-model";

export type JumpKind = "repository" | "branch" | "pull" | "issue" | "file";

export const JUMP_KIND_ORDER: readonly JumpKind[] = ["repository", "branch", "pull", "issue", "file"];

export const DEFAULT_JUMP_LIMIT = 6;

const DAY_MS = 86_400_000;

export interface JumpTarget {
  id: string;
  kind: JumpKind;
  title: string;
  subtitle?: string;
  keywords?: string;
  recentAt?: number;
  run: () => void | Promise<void>;
}

export function recencyBoost(recentAt: number | undefined, now: number): number {
  if (recentAt === undefined || recentAt <= 0) {
    return 0;
  }
  const age = now - recentAt;
  if (age < 0 || age <= DAY_MS) {
    return 40;
  }
  if (age <= 7 * DAY_MS) {
    return 25;
  }
  if (age <= 30 * DAY_MS) {
    return 12;
  }
  return 0;
}

export function rankJumpTargets(
  targets: readonly JumpTarget[],
  query: string,
  now: number,
  limitPerKind: number = DEFAULT_JUMP_LIMIT,
): JumpTarget[] {
  if (query.trim() === "") {
    return [];
  }
  const scored: Array<{ target: JumpTarget; score: number; order: number }> = [];
  targets.forEach((target, order) => {
    const base = scoreItem({ title: target.title, keywords: `${target.keywords ?? ""} ${target.subtitle ?? ""}` }, query);
    if (base !== null) {
      scored.push({ target, score: base + recencyBoost(target.recentAt, now), order });
    }
  });
  scored.sort((left, right) => right.score - left.score || left.order - right.order);
  const result: JumpTarget[] = [];
  for (const kind of JUMP_KIND_ORDER) {
    result.push(
      ...scored
        .filter((entry) => entry.target.kind === kind)
        .slice(0, limitPerKind)
        .map((entry) => entry.target),
    );
  }
  return result;
}
