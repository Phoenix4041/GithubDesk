import { useEffect } from "react";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { call, listenToRepoChanges } from "@/shared/lib/tauri-client";

const MINIMUM_REFRESH_INTERVAL_MS = 1000;

export function useRepoWatcher(repoPath: string): void {
  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | null = null;
    let lastRefresh = 0;
    let pendingTimer: number | null = null;

    function runRefresh() {
      lastRefresh = Date.now();
      void refreshRepository(repoPath);
    }

    function scheduleRefresh() {
      const elapsed = Date.now() - lastRefresh;
      if (elapsed >= MINIMUM_REFRESH_INTERVAL_MS) {
        runRefresh();
        return;
      }
      if (pendingTimer === null) {
        pendingTimer = window.setTimeout(() => {
          pendingTimer = null;
          runRefresh();
        }, MINIMUM_REFRESH_INTERVAL_MS - elapsed);
      }
    }

    async function start() {
      try {
        const unlisten = await listenToRepoChanges((changedPath) => {
          if (changedPath === repoPath) {
            scheduleRefresh();
          }
        });
        if (disposed) {
          unlisten();
          return;
        }
        stopListening = unlisten;
        await call<void>("watch_start", { path: repoPath });
      } catch (error) {
        reportError(error);
      }
    }

    void start();

    return () => {
      disposed = true;
      stopListening?.();
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer);
      }
    };
  }, [repoPath]);
}

export function stopRepoWatcher(): Promise<void> {
  return call<void>("watch_stop");
}
