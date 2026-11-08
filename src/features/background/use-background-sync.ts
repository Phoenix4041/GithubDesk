import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useSettingsStore } from "@/features/settings/store";
import { runSyncOperation } from "@/features/sync/operations";
import { useSyncStore } from "@/features/sync/store";
import { TRAY_FETCH_EVENT } from "./api";
import { shouldFetchInBackground, syncIntervalMs } from "./background-model";

export function useBackgroundSync(repoPath: string): void {
  const enabled = useSettingsStore((state) => state.backgroundSyncEnabled);
  const minutes = useSettingsStore((state) => state.backgroundSyncMinutes);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = window.setInterval(() => {
      const ready = shouldFetchInBackground({
        busy: useSyncStore.getState().operation !== null,
        hidden: document.visibilityState === "hidden",
        online: navigator.onLine,
      });
      if (ready) {
        void runSyncOperation("fetch", repoPath);
      }
    }, syncIntervalMs(minutes));
    return () => window.clearInterval(timer);
  }, [enabled, minutes, repoPath]);

  useEffect(() => {
    let active = true;
    let unlisten: UnlistenFn | null = null;
    void listen(TRAY_FETCH_EVENT, () => void runSyncOperation("fetch", repoPath))
      .then((stop) => {
        if (active) {
          unlisten = stop;
        } else {
          stop();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unlisten?.();
    };
  }, [repoPath]);
}
