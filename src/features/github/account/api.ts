import { call } from "@/shared/lib/tauri-client";

export interface UserProfile {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
}

export interface ProfileUpdate {
  name: string;
  bio: string;
  company: string;
  location: string;
  blog: string;
}

export interface AccountEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface AccountSshKey {
  id: number;
  title: string;
  key: string;
  createdAt: string;
}

export interface AccountGpgKey {
  id: number;
  keyId: string;
  name: string | null;
  emails: Array<{ email: string; verified: boolean }>;
  canSign: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export function getProfile(accountId: string): Promise<UserProfile> {
  return call<UserProfile>("github_profile_get", { accountId });
}

export function updateProfile(accountId: string, update: ProfileUpdate): Promise<UserProfile> {
  return call<UserProfile>("github_profile_update", { accountId, update });
}

export function listEmails(accountId: string): Promise<AccountEmail[]> {
  return call<AccountEmail[]>("github_emails_list", { accountId });
}

export function listSshKeys(accountId: string, signing: boolean): Promise<AccountSshKey[]> {
  return call<AccountSshKey[]>("github_ssh_keys_list", { accountId, signing });
}

export function addSshKey(accountId: string, signing: boolean, title: string, key: string): Promise<AccountSshKey> {
  return call<AccountSshKey>("github_ssh_key_add", { accountId, signing, title, key });
}

export function deleteSshKey(accountId: string, signing: boolean, id: number): Promise<void> {
  return call<void>("github_ssh_key_delete", { accountId, signing, id });
}

export function listGpgKeys(accountId: string): Promise<AccountGpgKey[]> {
  return call<AccountGpgKey[]>("github_gpg_keys_list", { accountId });
}

export function addGpgKey(accountId: string, name: string, armored: string): Promise<AccountGpgKey> {
  return call<AccountGpgKey>("github_gpg_key_add", { accountId, name, armored });
}

export function deleteGpgKey(accountId: string, id: number): Promise<void> {
  return call<void>("github_gpg_key_delete", { accountId, id });
}

export function readPublicKeyFile(path: string): Promise<string> {
  return call<string>("read_public_key_file", { path });
}

export function exportGpgPublicKey(keyId: string): Promise<string> {
  return call<string>("signing_export_public_key", { keyId });
}
