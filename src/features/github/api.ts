import { call } from "@/shared/lib/tauri-client";
import type { DeviceCode, GithubAccount, RemoteRepo } from "@/shared/types/git";

export function listAccounts(): Promise<GithubAccount[]> {
  return call<GithubAccount[]>("github_accounts_list");
}

export function addAccountWithToken(host: string, token: string): Promise<GithubAccount> {
  return call<GithubAccount>("github_account_add_token", { host, token });
}

export function removeAccount(id: string): Promise<void> {
  return call<void>("github_account_remove", { id });
}

export function startDeviceFlow(host: string, clientId: string): Promise<DeviceCode> {
  return call<DeviceCode>("github_device_start", { host, clientId });
}

export function finishDeviceFlow(host: string, clientId: string, code: DeviceCode, jobId: string): Promise<GithubAccount> {
  return call<GithubAccount>("github_device_finish", { host, clientId, code, jobId });
}

export function listGithubRemotes(path: string): Promise<RemoteRepo[]> {
  return call<RemoteRepo[]>("github_repo_remotes", { path });
}

export function setGitAccount(path: string, accountId: string | null): Promise<void> {
  return call<void>("github_set_git_account", { path, accountId });
}
