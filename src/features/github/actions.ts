import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { cancelJob } from "@/shared/lib/tauri-client";
import type { DeviceCode, GithubAccount } from "@/shared/types/git";
import { showToast } from "@/shared/ui/toast-store";
import { addAccountWithToken, finishDeviceFlow, removeAccount } from "./api";
import { accountKeys } from "./queries";

function announceAdded(account: GithubAccount): void {
  showToast({ kind: "success", title: i18next.t("github.accounts.added", { login: account.login }) });
}

export async function connectWithToken(host: string, token: string): Promise<GithubAccount | null> {
  try {
    const account = await addAccountWithToken(host, token);
    await queryClient.invalidateQueries({ queryKey: accountKeys.all });
    announceAdded(account);
    return account;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export async function completeDeviceFlow(
  host: string,
  clientId: string,
  code: DeviceCode,
  jobId: string,
): Promise<GithubAccount | null> {
  try {
    const account = await finishDeviceFlow(host, clientId, code, jobId);
    await queryClient.invalidateQueries({ queryKey: accountKeys.all });
    announceAdded(account);
    return account;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export function cancelDeviceFlow(jobId: string): void {
  void cancelJob(jobId);
}

export async function disconnectAccount(account: GithubAccount): Promise<boolean> {
  try {
    await removeAccount(account.id);
    await queryClient.invalidateQueries({ queryKey: accountKeys.all });
    showToast({ kind: "info", title: i18next.t("github.accounts.removed", { login: account.login }) });
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}
