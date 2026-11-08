import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { i18next } from "@/i18n";
import { openRepositoryFromPath } from "@/features/repositories/actions";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { LAUNCH_EVENT, takePendingLaunch } from "./api";
import type { LaunchRequest } from "./api";

export async function handleLaunchRequest(request: LaunchRequest): Promise<void> {
  if (request.kind === "open") {
    await openRepositoryFromPath(request.path);
    return;
  }
  useRepositoryDialogStore.getState().show("clone", { url: request.url, accountId: null });
  if (request.branch) {
    showToast({
      kind: "info",
      title: i18next.t("launch.cloneTitle"),
      message: i18next.t("launch.cloneBranch", { branch: request.branch }),
    });
  }
}

async function consumePendingLaunch(): Promise<void> {
  try {
    const request = await takePendingLaunch();
    if (request) {
      await handleLaunchRequest(request);
    }
  } catch (error) {
    reportError(error);
  }
}

export function useLaunchRequests(): void {
  useEffect(() => {
    let active = true;
    let unlisten: UnlistenFn | null = null;
    void consumePendingLaunch();
    void listen(LAUNCH_EVENT, () => void consumePendingLaunch())
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
  }, []);
}
