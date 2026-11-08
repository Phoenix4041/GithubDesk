import { call } from "@/shared/lib/tauri-client";

export const LAUNCH_EVENT = "launch-request";

export type LaunchRequest = { kind: "open"; path: string } | { kind: "clone"; url: string; branch: string | null };

export function takePendingLaunch(): Promise<LaunchRequest | null> {
  return call<LaunchRequest | null>("launch_take_pending");
}
