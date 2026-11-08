import { call } from "@/shared/lib/tauri-client";

export const TRAY_FETCH_EVENT = "tray-fetch";

export interface TrayLabels {
  open: string;
  fetch: string;
  quit: string;
  tooltip: string;
}

export function setTrayEnabled(enabled: boolean, labels: TrayLabels | null): Promise<void> {
  return call<void>("tray_set_enabled", { enabled, labels });
}

export function setTrayPending(count: number, tooltip: string): Promise<void> {
  return call<void>("tray_set_pending", { count, tooltip });
}

export function getAutostart(): Promise<boolean> {
  return call<boolean>("autostart_get");
}

export function setAutostart(enabled: boolean): Promise<boolean> {
  return call<boolean>("autostart_set", { enabled });
}
