import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppError, ErrorKind, Progress, SuggestedAction } from "@/shared/types/git";

export class CommandError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(appError.detail || appError.kind);
    this.name = "CommandError";
    this.appError = appError;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toCommandError(raw: unknown): CommandError {
  if (raw instanceof CommandError) {
    return raw;
  }
  if (isRecord(raw) && typeof raw.kind === "string") {
    const kind = raw.kind as ErrorKind;
    const suggestedAction = typeof raw.suggestedAction === "string" ? (raw.suggestedAction as SuggestedAction) : null;
    const detail = typeof raw.detail === "string" ? raw.detail : "";
    return new CommandError({ kind, suggestedAction, detail });
  }
  const detail = raw instanceof Error ? raw.message : String(raw);
  return new CommandError({ kind: "unknown", suggestedAction: null, detail });
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    throw toCommandError(raw);
  }
}

export async function callWithProgress<T>(
  command: string,
  args: Record<string, unknown>,
  onProgress: (progress: Progress) => void,
): Promise<T> {
  const channel = new Channel<Progress>();
  channel.onmessage = onProgress;
  return call<T>(command, { ...args, onProgress: channel });
}

export function cancelJob(jobId: string): Promise<boolean> {
  return call<boolean>("job_cancel", { jobId });
}

export function listenToRepoChanges(handler: (path: string) => void): Promise<() => void> {
  return listen<{ path: string }>("repo-changed", (event) => {
    handler(event.payload.path);
  });
}

export function isCancelled(error: unknown): boolean {
  return error instanceof CommandError && error.appError.kind === "cancelled";
}
