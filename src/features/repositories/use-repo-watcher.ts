import { useEffect } from "react";
import { refreshRepository } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { call, listenToRepoChanges } from "@/shared/lib/tauri-client";

export function useRepoWatcher(repoPath: string): void {
  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | null = null;

    async function start() {
      try {
        const unlisten = await listenToRepoChanges((changedPath) => {
          if (changedPath === repoPath) {
            void refreshRepository(repoPath);
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
    };
  }, [repoPath]);
}

export function stopRepoWatcher(): Promise<void> {
  return call<void>("watch_stop");
}
