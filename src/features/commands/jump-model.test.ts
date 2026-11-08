import { describe, expect, it } from "vitest";
import { JUMP_KIND_ORDER, rankJumpTargets, recencyBoost } from "./jump-model";
import type { JumpKind, JumpTarget } from "./jump-model";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function target(id: string, kind: JumpKind, title: string, extra: Partial<JumpTarget> = {}): JumpTarget {
  return { id, kind, title, run: () => undefined, ...extra };
}

describe("recencyBoost", () => {
  it("rewards recent activity and fades with age", () => {
    expect(recencyBoost(NOW - 1000, NOW)).toBeGreaterThan(recencyBoost(NOW - 3 * DAY, NOW));
    expect(recencyBoost(NOW - 3 * DAY, NOW)).toBeGreaterThan(recencyBoost(NOW - 20 * DAY, NOW));
    expect(recencyBoost(NOW - 20 * DAY, NOW)).toBeGreaterThan(0);
    expect(recencyBoost(NOW - 90 * DAY, NOW)).toBe(0);
    expect(recencyBoost(undefined, NOW)).toBe(0);
  });
});

describe("rankJumpTargets", () => {
  it("returns nothing for an empty query", () => {
    expect(rankJumpTargets([target("a", "branch", "main")], "  ", NOW)).toEqual([]);
  });

  it("matches loosely and ignores accents", () => {
    const result = rankJumpTargets([target("a", "pull", "Corrección de caída"), target("b", "pull", "Otra cosa")], "correccion", NOW);
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("prefers the more recent target when the text matches equally", () => {
    const result = rankJumpTargets(
      [
        target("old", "repository", "alpha-app", { recentAt: NOW - 90 * DAY }),
        target("new", "repository", "alpha-app", { recentAt: NOW - 1000 }),
      ],
      "alpha",
      NOW,
    );
    expect(result.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("groups results by kind in a fixed order", () => {
    const result = rankJumpTargets(
      [
        target("f", "file", "main.rs"),
        target("i", "issue", "main bug"),
        target("b", "branch", "main"),
        target("r", "repository", "main-repo"),
        target("p", "pull", "main fix"),
      ],
      "main",
      NOW,
    );
    expect(result.map((item) => item.kind)).toEqual([...JUMP_KIND_ORDER]);
  });

  it("limits how many results each kind contributes", () => {
    const files = Array.from({ length: 10 }, (_, index) => target(`f${index}`, "file", `file-${index}.ts`));
    expect(rankJumpTargets(files, "file", NOW, 3)).toHaveLength(3);
  });

  it("finds a target through its subtitle and keywords", () => {
    const result = rankJumpTargets(
      [target("f", "file", "index.ts", { subtitle: "src/features/home", keywords: "src/features/home/index.ts" })],
      "features",
      NOW,
    );
    expect(result).toHaveLength(1);
  });
});
