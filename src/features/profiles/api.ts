import { call } from "@/shared/lib/tauri-client";
import type { Identity, IdentityUpdate, SigningKeys } from "@/shared/types/git";

export function getIdentity(path: string): Promise<Identity> {
  return call<Identity>("identity_get", { path });
}

export function applyIdentity(path: string, update: IdentityUpdate): Promise<void> {
  return call<void>("identity_apply", { path, update });
}

export function listKeysOutsideRepository(): Promise<SigningKeys> {
  return call<SigningKeys>("signing_keys_list", { path: "." });
}
