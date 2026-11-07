import { call } from "@/shared/lib/tauri-client";
import type { SignatureInfo, SigningConfig, SigningKeys, SigningUpdate } from "@/shared/types/git";

export function getSigningConfig(path: string): Promise<SigningConfig> {
  return call<SigningConfig>("signing_config_get", { path });
}

export function setSigningConfig(path: string, update: SigningUpdate): Promise<void> {
  return call<void>("signing_config_set", { path, update });
}

export function listSigningKeys(path: string): Promise<SigningKeys> {
  return call<SigningKeys>("signing_keys_list", { path });
}

export function testSigning(path: string): Promise<void> {
  return call<void>("signing_test", { path });
}

export function getCommitSignature(path: string, hash: string): Promise<SignatureInfo> {
  return call<SignatureInfo>("commit_signature_get", { path, hash });
}
