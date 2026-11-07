import { describe, expect, it } from "vitest";
import { isSafeExternalUrl } from "./external";

describe("isSafeExternalUrl", () => {
  it("accepts https addresses and local http servers", () => {
    expect(isSafeExternalUrl("https://github.com/login/device")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:3000/x")).toBe(true);
    expect(isSafeExternalUrl("http://127.0.0.1:8080")).toBe(true);
  });

  it("rejects other schemes, plain http hosts and malformed text", () => {
    expect(isSafeExternalUrl("http://example.com")).toBe(false);
    expect(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("ms-settings:privacy")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);
    expect(isSafeExternalUrl("http://localhost.evil.com")).toBe(false);
  });
});
