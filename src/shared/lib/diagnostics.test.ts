import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { useToastStore } from "../ui/toast-store";
import { describeUnknown, installWindowErrorLogging, logClientError } from "./diagnostics";
import { reportError } from "./report-error";
import { CommandError } from "./tauri-client";

interface Logged {
  source: string;
  kind: string;
  detail: string;
}

function capture(): Logged[] {
  const entries: Logged[] = [];
  mockIPC((command, payload) => {
    if (command === "diagnostics_log") {
      entries.push(payload as unknown as Logged);
    }
    return null;
  });
  return entries;
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("diagnostics", () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("describes errors, strings and other values as text", () => {
    expect(describeUnknown(new Error("boom"))).toContain("boom");
    expect(describeUnknown("plain")).toBe("plain");
    expect(describeUnknown({ a: 1 })).toBe('{"a":1}');
  });

  it("sends the source, kind and detail to the backend", async () => {
    const entries = capture();
    logClientError("window", "uncaught", "something failed");
    await flush();
    expect(entries).toEqual([{ source: "window", kind: "uncaught", detail: "something failed" }]);
  });

  it("cuts very long details before sending them", async () => {
    const entries = capture();
    logClientError("render", "Error", "x".repeat(9000));
    await flush();
    expect(entries[0]?.detail.length).toBe(4000);
  });

  it("never throws when the backend cannot be reached", async () => {
    mockIPC(() => {
      throw new Error("backend is gone");
    });
    expect(() => logClientError("window", "uncaught", "x")).not.toThrow();
    await flush();
  });

  it("logs uncaught errors and unhandled rejections of the window", async () => {
    const entries = capture();
    const target = new EventTarget() as unknown as Window;
    installWindowErrorLogging(target);
    target.dispatchEvent(Object.assign(new Event("error"), { error: new Error("render crash"), message: "render crash" }));
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "rejected for a reason" }));
    await flush();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe("uncaught");
    expect(entries[0]?.detail).toContain("render crash");
    expect(entries[1]).toEqual({ source: "window", kind: "unhandledRejection", detail: "rejected for a reason" });
  });

  it("records the kind and detail of every error shown to the user", async () => {
    const entries = capture();
    reportError(new CommandError({ kind: "remoteAhead", suggestedAction: null, detail: "rejected non-fast-forward" }));
    await flush();
    expect(entries).toEqual([{ source: "command", kind: "remoteAhead", detail: "rejected non-fast-forward" }]);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("does not record a cancelled operation as an error", async () => {
    const entries = capture();
    reportError(new CommandError({ kind: "cancelled", suggestedAction: null, detail: "" }));
    await flush();
    expect(entries).toHaveLength(0);
  });
});
