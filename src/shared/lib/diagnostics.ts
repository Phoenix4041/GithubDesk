import { invoke } from "@tauri-apps/api/core";

const MAX_DETAIL_LENGTH = 4000;

export type ErrorSource = "command" | "render" | "window";

export function describeUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
}

export function logClientError(source: ErrorSource, kind: string, detail: string): void {
  invoke("diagnostics_log", { source, kind, detail: detail.slice(0, MAX_DETAIL_LENGTH) }).catch(() => undefined);
}

export function openLogFolder(): Promise<void> {
  return invoke<void>("diagnostics_open_folder");
}

export function installWindowErrorLogging(target: Window): void {
  target.addEventListener("error", (event) => {
    logClientError("window", "uncaught", describeUnknown(event.error ?? event.message));
  });
  target.addEventListener("unhandledrejection", (event) => {
    logClientError("window", "unhandledRejection", describeUnknown(event.reason));
  });
}
