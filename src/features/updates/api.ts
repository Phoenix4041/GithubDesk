import { call } from "@/shared/lib/tauri-client";

export interface UpdateStatus {
  configured: boolean;
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  url: string | null;
}

export function checkForUpdate(): Promise<UpdateStatus> {
  return call<UpdateStatus>("app_update_check");
}
