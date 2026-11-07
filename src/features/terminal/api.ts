import { Channel } from "@tauri-apps/api/core";
import { call } from "@/shared/lib/tauri-client";

export type TerminalEvent = { kind: "output"; data: string } | { kind: "exit"; code: number | null };

export interface ShellOption {
  id: string;
  label: string;
}

export function listShells(): Promise<ShellOption[]> {
  return call<ShellOption[]>("terminal_shells");
}

export function openTerminal(
  sessionId: string,
  path: string,
  shell: string | null,
  columns: number,
  rows: number,
  onEvent: (event: TerminalEvent) => void,
): Promise<void> {
  const channel = new Channel<TerminalEvent>();
  channel.onmessage = onEvent;
  return call<void>("terminal_open", { sessionId, path, shell, columns, rows, onEvent: channel });
}

export function writeTerminal(sessionId: string, data: string): Promise<void> {
  return call<void>("terminal_write", { sessionId, data });
}

export function resizeTerminal(sessionId: string, columns: number, rows: number): Promise<void> {
  return call<void>("terminal_resize", { sessionId, columns, rows });
}

export function closeTerminal(sessionId: string): Promise<void> {
  return call<void>("terminal_close", { sessionId });
}
