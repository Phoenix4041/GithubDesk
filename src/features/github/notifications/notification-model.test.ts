import { describe, expect, it } from "vitest";
import type { GithubNotification } from "./api";
import { badgeText, newNotifications, pollMilliseconds, summarize, unreadCount } from "./notification-model";

function item(id: string, overrides: Partial<GithubNotification> = {}): GithubNotification {
  return {
    id,
    unread: true,
    reason: "mention",
    subject: { title: `Title ${id}`, kind: "Issue", url: null },
    repository: { fullName: "acme/app" },
    updatedAt: "",
    webUrl: null,
    ...overrides,
  };
}

describe("notification model", () => {
  it("only reports unread notifications that were not seen before", () => {
    const seen = new Set(["1"]);
    const found = newNotifications([item("1"), item("2"), item("3", { unread: false })], seen);
    expect(found.map((entry) => entry.id)).toEqual(["2"]);
    expect(newNotifications([], seen)).toEqual([]);
  });

  it("never polls faster than once a minute", () => {
    expect(pollMilliseconds(null)).toBe(120_000);
    expect(pollMilliseconds(30)).toBe(60_000);
    expect(pollMilliseconds(300)).toBe(300_000);
  });

  it("counts unread notifications and shortens big numbers", () => {
    expect(unreadCount(undefined)).toBe(0);
    expect(unreadCount([item("1"), item("2", { unread: false })])).toBe(1);
    expect(badgeText(7)).toBe("7");
    expect(badgeText(100)).toBe("99+");
  });

  it("summarizes the first few and counts the rest", () => {
    const many = ["1", "2", "3", "4", "5"].map((id) => item(id));
    expect(summarize(many, 2)).toBe("acme/app: Title 1\nacme/app: Title 2\n+3");
    expect(summarize([item("1")])).toBe("acme/app: Title 1");
  });
});
