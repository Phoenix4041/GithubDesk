import { describe, expect, it } from "vitest";
import {
  appendCoauthors,
  applyIssueRefs,
  applyIssueToTitle,
  coauthorTrailer,
  issueNumberFromBranch,
} from "./commit-message-model";

const ANA = { name: "Ana", email: "ana@example.com" };
const LUIS = { name: "Luis", email: "luis@example.com" };

describe("co-author trailers", () => {
  it("formats one trailer", () => {
    expect(coauthorTrailer({ name: " Ana ", email: " ana@example.com " })).toBe("Co-authored-by: Ana <ana@example.com>");
  });

  it("leaves a blank line between the body and the trailers", () => {
    expect(appendCoauthors("Body text\n", [ANA, LUIS])).toBe(
      "Body text\n\nCo-authored-by: Ana <ana@example.com>\nCo-authored-by: Luis <luis@example.com>",
    );
  });

  it("writes only the trailers when the description is empty", () => {
    expect(appendCoauthors("", [ANA])).toBe("Co-authored-by: Ana <ana@example.com>");
  });

  it("skips people already listed and repeated choices", () => {
    const body = "Body\n\nco-authored-by: Ana <ANA@example.com>";
    expect(appendCoauthors(body, [ANA, LUIS, LUIS])).toBe(`${body}\nCo-authored-by: Luis <luis@example.com>`);
    expect(appendCoauthors(body, [ANA])).toBe(body);
  });

  it("ignores people without name or email", () => {
    expect(appendCoauthors("Body", [{ name: "", email: "x@example.com" }, { name: "X", email: " " }])).toBe("Body");
  });

  it("normalizes Windows line endings", () => {
    expect(appendCoauthors("One\r\nTwo\r\n", [ANA])).toBe("One\nTwo\n\nCo-authored-by: Ana <ana@example.com>");
  });
});

describe("issue number from the branch name", () => {
  it.each([
    ["123-arreglo", 123],
    ["feature/123-x", 123],
    ["fix-123", 123],
    ["gh-45", 45],
    ["user/fix/77_login", 77],
    ["issue-9", 9],
  ])("reads %s", (branch, expected) => {
    expect(issueNumberFromBranch(branch)).toBe(expected);
  });

  it.each([["main"], ["v2"], ["feature/login"], ["release-0"], [""]])("finds nothing in %s", (branch) => {
    expect(issueNumberFromBranch(branch)).toBeNull();
  });

  it("finds nothing without a branch", () => {
    expect(issueNumberFromBranch(null)).toBeNull();
  });
});

describe("issue prefix", () => {
  it("puts the number before the title once", () => {
    expect(applyIssueToTitle("Fix login", 12)).toBe("#12: Fix login");
    expect(applyIssueToTitle("#12: Fix login", 12)).toBe("#12: Fix login");
    expect(applyIssueToTitle("", 12)).toBe("#12: ");
  });

  it("does not confuse a longer number", () => {
    expect(applyIssueToTitle("#123: Fix", 12)).toBe("#12: #123: Fix");
  });

  it("adds a reference line to the description once", () => {
    expect(applyIssueRefs("", 7)).toBe("Refs #7");
    expect(applyIssueRefs("Body\n", 7)).toBe("Body\n\nRefs #7");
    expect(applyIssueRefs("Body\n\nRefs #7", 7)).toBe("Body\n\nRefs #7");
  });
});
