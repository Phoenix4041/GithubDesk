import { i18next } from "@/i18n";
import { openExternal } from "@/shared/lib/external";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { checkForUpdate } from "./api";
import type { UpdateStatus } from "./api";

export const LAST_CHECK_KEY = "githubdesk.update-check";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldCheck(lastCheck: number | null, now: number): boolean {
  return lastCheck === null || !Number.isFinite(lastCheck) || now - lastCheck >= CHECK_INTERVAL_MS || lastCheck > now;
}

function readLastCheck(): number | null {
  const stored = window.localStorage.getItem(LAST_CHECK_KEY);
  return stored === null ? null : Number(stored);
}

function announce(status: UpdateStatus): void {
  const url = status.url;
  showToast({
    kind: "info",
    title: i18next.t("updates.available", { version: status.latest ?? "" }),
    message: i18next.t("updates.current", { version: status.current }),
    actions: url ? [{ label: i18next.t("updates.view"), run: () => void openExternal(url) }] : [],
  });
}

export async function checkForUpdates(manual: boolean, now = Date.now()): Promise<void> {
  if (!manual && !shouldCheck(readLastCheck(), now)) {
    return;
  }
  let status: UpdateStatus;
  try {
    status = await checkForUpdate();
  } catch (error) {
    if (manual) {
      reportError(error);
    }
    return;
  }
  if (!status.configured) {
    if (manual) {
      showToast({ kind: "info", title: i18next.t("updates.notConfigured") });
    }
    return;
  }
  window.localStorage.setItem(LAST_CHECK_KEY, String(now));
  if (status.updateAvailable) {
    announce(status);
  } else if (manual) {
    showToast({ kind: "success", title: i18next.t("updates.upToDate", { version: status.current }) });
  }
}
