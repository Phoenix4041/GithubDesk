import { describe, expect, it } from "vitest";
import type { RebasePlan } from "@/shared/types/git";
import {
  createDraft,
  groupMembers,
  isUnchanged,
  moveStep,
  needsFinalMessage,
  rewritesPublishedCommits,
  toPayload,
  validateDraft,
} from "./rebase-model";
import type { DraftStep } from "./rebase-model";

const plan: RebasePlan = {
  base: "base",
  commits: [
    { hash: "a", shortHash: "a", subject: "first", authorName: "Ada", pushed: false },
    { hash: "b", shortHash: "b", subject: "second", authorName: "Ada", pushed: true },
    { hash: "c", shortHash: "c", subject: "third", authorName: "Ada", pushed: false },
  ],
};

function withActions(...actions: DraftStep["action"][]): DraftStep[] {
  return createDraft(plan).map((step, index) => ({ ...step, action: actions[index] ?? "pick" }));
}

describe("createDraft", () => {
  it("keeps the plan order and starts with picks", () => {
    const draft = createDraft(plan);
    expect(draft.map((step) => step.hash)).toEqual(["a", "b", "c"]);
    expect(draft.every((step) => step.action === "pick")).toBe(true);
    expect(isUnchanged(draft, plan)).toBe(true);
  });
});

describe("moveStep", () => {
  it("moves a step up and down", () => {
    const draft = createDraft(plan);
    expect(moveStep(draft, 2, 1).map((step) => step.hash)).toEqual(["a", "c", "b"]);
    expect(moveStep(draft, 0, 1).map((step) => step.hash)).toEqual(["b", "a", "c"]);
  });

  it("ignores moves outside the list", () => {
    const draft = createDraft(plan);
    expect(moveStep(draft, 0, -1).map((step) => step.hash)).toEqual(["a", "b", "c"]);
    expect(moveStep(draft, 2, 3).map((step) => step.hash)).toEqual(["a", "b", "c"]);
  });

  it("makes the draft count as changed", () => {
    expect(isUnchanged(moveStep(createDraft(plan), 1, 0), plan)).toBe(false);
    expect(isUnchanged(withActions("pick", "drop", "pick"), plan)).toBe(false);
  });
});

describe("validateDraft", () => {
  it("accepts picks, drops and squashes after a kept commit", () => {
    expect(validateDraft(withActions("pick", "squash", "fixup"))).toBeNull();
    expect(validateDraft(withActions("drop", "pick", "squash"))).toBeNull();
  });

  it("rejects a squash with nothing before it", () => {
    expect(validateDraft(withActions("squash", "pick", "pick"))).toBe("firstSquash");
    expect(validateDraft(withActions("drop", "fixup", "pick"))).toBe("firstSquash");
  });

  it("requires a message for reworded commits", () => {
    expect(validateDraft(withActions("reword", "pick", "pick"))).toBe("emptyReword");
    const draft = withActions("reword", "pick", "pick");
    const first = draft[0];
    if (first) {
      first.message = "New title";
    }
    expect(validateDraft(draft)).toBeNull();
  });
});

describe("groupMembers", () => {
  it("attaches squashes to the closest earlier kept commit", () => {
    const groups = groupMembers(withActions("pick", "squash", "fixup"));
    expect(groups.get(0)).toEqual([1, 2]);
    expect(groups.size).toBe(1);
  });

  it("lets drops sit between a group head and its members", () => {
    const groups = groupMembers(withActions("pick", "drop", "squash"));
    expect(groups.get(0)).toEqual([2]);
  });
});

describe("toPayload", () => {
  it("sends the message only where it matters", () => {
    const draft = withActions("reword", "pick", "squash").map((step, index) => ({
      ...step,
      message: index === 0 ? "Reworded" : index === 1 ? "Ignored" : "",
    }));
    const payload = toPayload(draft);
    expect(payload[0]).toEqual({ hash: "a", action: "reword", message: "Reworded" });
    expect(payload[1]).toEqual({ hash: "b", action: "pick", message: "Ignored" });
    expect(payload[2]).toEqual({ hash: "c", action: "squash", message: null });
  });

  it("omits blank group messages so git combines them", () => {
    const draft = withActions("pick", "squash", "pick");
    expect(toPayload(draft)[0]?.message).toBeNull();
  });
});

describe("needsFinalMessage", () => {
  it("is true for rewords and for heads with squashed members", () => {
    expect(needsFinalMessage(withActions("reword", "pick", "pick"), 0)).toBe(true);
    expect(needsFinalMessage(withActions("pick", "squash", "pick"), 0)).toBe(true);
    expect(needsFinalMessage(withActions("pick", "pick", "pick"), 0)).toBe(false);
    expect(needsFinalMessage(withActions("pick", "squash", "pick"), 1)).toBe(false);
  });
});

describe("rewritesPublishedCommits", () => {
  it("does not warn while nothing changes", () => {
    expect(rewritesPublishedCommits(withActions("pick", "pick", "pick"), plan)).toBe(false);
  });

  it("warns when a change rewrites a plan that holds published commits", () => {
    expect(rewritesPublishedCommits(withActions("pick", "reword", "pick"), plan)).toBe(true);
    expect(rewritesPublishedCommits(moveStep(createDraft(plan), 2, 0), plan)).toBe(true);
  });

  it("does not warn when no commit was published", () => {
    const local: RebasePlan = { ...plan, commits: plan.commits.map((commit) => ({ ...commit, pushed: false })) };
    expect(rewritesPublishedCommits(withActions("drop", "pick", "pick"), local)).toBe(false);
  });
});
