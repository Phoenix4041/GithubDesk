import { describe, expect, it } from "vitest";
import { MAX_VALUE_BYTES, nameProblem, shortValue, valueBytes, valueProblem } from "./secrets-model";

describe("secrets model", () => {
  it("accepts the names GitHub accepts", () => {
    for (const good of ["TOKEN", "api_key_2", "_private", "A"]) {
      expect(nameProblem(good)).toBeNull();
    }
  });

  it("explains why a name is refused", () => {
    expect(nameProblem("")).toBe("empty");
    expect(nameProblem("1TOKEN")).toBe("start");
    expect(nameProblem("-x")).toBe("start");
    expect(nameProblem("has space")).toBe("characters");
    expect(nameProblem("a-b")).toBe("characters");
    expect(nameProblem("ñandú")).toBe("start");
    expect(nameProblem("GITHUB_TOKEN")).toBe("reserved");
    expect(nameProblem("github_anything")).toBe("reserved");
    expect(nameProblem("A".repeat(101))).toBe("long");
  });

  it("counts the size of a value in bytes, not characters", () => {
    expect(valueBytes("abc")).toBe(3);
    expect(valueBytes("ñ")).toBe(2);
    expect(valueProblem("")).toBe("empty");
    expect(valueProblem("x")).toBeNull();
    expect(valueProblem("x".repeat(MAX_VALUE_BYTES))).toBeNull();
    expect(valueProblem("x".repeat(MAX_VALUE_BYTES + 1))).toBe("large");
    expect(valueProblem("ñ".repeat(MAX_VALUE_BYTES / 2 + 1))).toBe("large");
  });

  it("shortens long values on a single line for the list", () => {
    expect(shortValue("eu-west-1")).toBe("eu-west-1");
    expect(shortValue("line one\nline two")).toBe("line one line two");
    expect(shortValue("x".repeat(100), 20)).toBe(`${"x".repeat(17)}...`);
  });
});
